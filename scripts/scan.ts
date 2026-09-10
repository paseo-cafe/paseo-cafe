#!/usr/bin/env bun
/**
 * The "plumb for paseo" scanner. Walks every registry/*.json entry, reads
 * whatever metadata already exists in the plugin's own repo (paseo-plugin.json,
 * package.json, README, LICENSE, images/), asks the GitHub API for repo
 * stats, and writes the result to data/plugins/<id>.json + an aggregate
 * data/plugins.json index. This is the only place plugin metadata is
 * computed — the site never talks to GitHub directly.
 *
 * A single broken/renamed/deleted plugin repo does not fail the whole run:
 * its record is written with `scanError` set and health flags at their
 * safest defaults, so the listing can surface it as "needs attention"
 * instead of the whole build breaking.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import {
  extractReadmeImages,
  MAX_README_IMAGES,
  resolveGitHubAssetImages,
} from "../src/lib/images.ts"
import { renderMarkdownToHtml } from "../src/lib/markdown.ts"
import type { PluginRecord, PluginSecurity } from "../src/lib/plugin-schema.ts"
import {
  pluginRecordSchema,
  pluginSecuritySchema,
} from "../src/lib/plugin-schema.ts"
import {
  extractInstallSection,
  extractLimitationsSection,
  firstParagraph,
} from "../src/lib/readme.ts"
import {
  PLATFORM_LABELS,
  registryEntrySchema,
  registryIdSchema,
} from "../src/lib/registry-schema.ts"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "../src/lib/site.ts"
import { extractVideos, resolveGitHubAssetVideos } from "../src/lib/videos.ts"
import {
  fetchRawJson,
  fetchRawText,
  fetchRepoMeta,
  GitHubNotFoundError,
  listDir,
  rawUrl,
  resolveGitHubAssetContentType,
} from "./github.ts"
import { renderOgImage } from "./og-image.tsx"

// Scripts are always invoked via `bun run` from the repo root (see package.json).
const ROOT = process.cwd()
const REGISTRY_DIR = join(ROOT, "registry")
const OUTPUT_DIR = join(ROOT, "data", "plugins")

const SECURITY_ARTIFACT_PATHS = [
  join(ROOT, "data", "plugin-security-results.json"),
  join(ROOT, "data", "plugin-security.json"),
  join(ROOT, "data", "plugins-security.json"),
  join(ROOT, "data", "security.json"),
]

const SECURITY_RESULT_SCHEMA = z.object({
  commit: z.string(),
  scannedAt: z.string(),
  status: z.enum(["passed", "review-required", "failed", "unavailable"]),
  blockingFindings: z.number().int().nonnegative(),
  advisoryFindings: z.number().int().nonnegative(),
  reportUrl: z.string().optional(),
})

const SECURITY_RESULTS_ARTIFACT_SCHEMA = z.object({
  version: z.number().int().optional(),
  generatedAt: z.string().optional(),
  plugins: z.record(z.string(), SECURITY_RESULT_SCHEMA),
})

const SECURITY_MAP_ARTIFACT_SCHEMA = z.record(z.string(), pluginSecuritySchema)

const UNKNOWN_SECURITY: PluginSecurity = {
  status: "unknown",
  blockingFindings: 0,
  advisoryFindings: 0,
}

function loadPublishedSecurityCatalog(): Record<string, PluginSecurity> {
  for (const artifactPath of SECURITY_ARTIFACT_PATHS) {
    if (!existsSync(artifactPath)) continue
    try {
      const raw = JSON.parse(readFileSync(artifactPath, "utf8")) as unknown
      const map = SECURITY_MAP_ARTIFACT_SCHEMA.safeParse(raw)
      if (map.success) return map.data

      const results = SECURITY_RESULTS_ARTIFACT_SCHEMA.safeParse(raw)
      if (results.success) {
        const catalog: Record<string, PluginSecurity> = {}
        for (const [id, security] of Object.entries(results.data.plugins)) {
          catalog[id] = {
            status:
              security.status === "passed" || security.status === "failed"
                ? security.status
                : "unknown",
            blockingFindings: security.blockingFindings,
            advisoryFindings: security.advisoryFindings,
            scannedAt: security.scannedAt,
            commit: security.commit,
            reportUrl: security.reportUrl,
          }
        }
        return catalog
      }
    } catch {
      // Ignore unreadable or malformed published security artifacts.
    }
  }
  return {}
}
const INDEX_PATH = join(ROOT, "data", "plugins.json")
const PUBLIC_DIR = join(ROOT, "public")
const OG_DIR = join(PUBLIC_DIR, "og")
const RECENT_DAYS = 180

interface PackageJson {
  description?: string
  version?: string
  author?: string | { name?: string }
  license?: string
  scripts?: Record<string, string>
}

function authorName(author: PackageJson["author"]): string | undefined {
  if (!author) return undefined
  return typeof author === "string" ? author : author.name
}

function isRecent(iso: string): boolean {
  const pushed = new Date(iso).getTime()
  const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
  return pushed >= cutoff
}

async function scanOne(
  entryFile: string,
  securityCatalog: Record<string, PluginSecurity>
): Promise<PluginRecord> {
  const id = registryIdSchema.parse(entryFile.slice(0, -".json".length))
  const raw = JSON.parse(readFileSync(join(REGISTRY_DIR, entryFile), "utf8"))
  const entry = registryEntrySchema.parse(raw)
  const [owner, repo] = entry.repo.split("/")
  const scannedAt = new Date().toISOString()
  const prefix = entry.path ? `${entry.path}/` : ""
  const fallbackUrl = `https://github.com/${entry.repo}${entry.path ? `/tree/HEAD/${entry.path}` : ""}`
  const security = securityCatalog[id] ?? UNKNOWN_SECURITY

  const base: PluginRecord = {
    id,
    repo: entry.repo,
    path: entry.path,
    url: fallbackUrl,
    name: id,
    description: "",
    categories: entry.categories,
    platforms: entry.platforms,
    caveats: entry.caveats,
    health: {
      manifestValid: false,
      hasReadme: false,
      hasLicense: false,
      hasTests: false,
      hasTypecheckScript: false,
      updatedRecently: false,
    },
    security,
    images: [],
    videos: [],
    scannedAt,
  }

  try {
    const repoMeta = await fetchRepoMeta(owner, repo)
    const branch = repoMeta.default_branch
    const dirEntries = await listDir(owner, repo, entry.path ?? "", branch)
    const byName = new Map(dirEntries.map((e) => [e.name, e]))

    const manifest = await fetchRawJson<Record<string, unknown>>(
      owner,
      repo,
      branch,
      `${prefix}paseo-plugin.json`
    )
    const pkg = await fetchRawJson<PackageJson>(
      owner,
      repo,
      branch,
      `${prefix}package.json`
    )

    const readmeEntry = byName.get("README.md") ?? byName.get("readme.md")
    const readme = readmeEntry
      ? await fetchRawText(owner, repo, branch, readmeEntry.path)
      : null
    const readmeText = readme == null ? undefined : readme.slice(0, 200000)
    const readmeHtml =
      readmeText === undefined
        ? undefined
        : await renderMarkdownToHtml(readmeText)

    const hasLicenseFile =
      byName.has("LICENSE") || byName.has("LICENSE.md") || byName.has("license")
    const imagesDirEntry = byName.get("images")
    const imageDirEntries =
      imagesDirEntry?.type === "dir"
        ? await listDir(owner, repo, imagesDirEntry.path, branch)
        : []

    const manifestId =
      typeof manifest?.id === "string" ? manifest.id : undefined
    const manifestDescription =
      typeof manifest?.description === "string"
        ? manifest.description
        : undefined
    const manifestRequirements =
      manifest?.requirements && typeof manifest.requirements === "object"
        ? (manifest.requirements as Record<string, unknown>)
        : undefined
    const paseoVersionRequirement =
      typeof manifestRequirements?.paseo === "string"
        ? manifestRequirements.paseo
        : undefined

    const installNotes = extractInstallSection(readme ?? "")
    const installNotesHtml = installNotes
      ? await renderMarkdownToHtml(installNotes)
      : undefined

    const limitationsNotes = extractLimitationsSection(readme ?? "")
    const limitationsNotesHtml = limitationsNotes
      ? await renderMarkdownToHtml(limitationsNotes)
      : undefined

    const readmeVideos = extractVideos(readme ?? "")
    const assetVideos = readme
      ? await resolveGitHubAssetVideos(
          readme,
          resolveGitHubAssetContentType,
          readmeVideos
        )
      : []
    const videos = [...readmeVideos, ...assetVideos]

    const readmeImageRefs = extractReadmeImages(readme ?? "")
    const readmeAssetImages = readme
      ? await resolveGitHubAssetImages(
          readme,
          resolveGitHubAssetContentType,
          readmeImageRefs
        )
      : []
    const resolveReadmeImageUrl = (ref: string): string => {
      if (/^https?:\/\//i.test(ref)) return ref
      const rootRelative = ref.startsWith("/")
      const cleaned = ref
        .replace(/^\.\//, "")
        .replace(/^\//, "")
        .replace(/[#?].*$/, "")
      return rawUrl(
        owner,
        repo,
        branch,
        rootRelative ? cleaned : `${prefix}${cleaned}`
      )
    }
    const readmeImages = [...readmeImageRefs, ...readmeAssetImages].map(
      resolveReadmeImageUrl
    )
    const dirImages = imageDirEntries
      .filter((e) => e.type === "file")
      .map((e) => rawUrl(owner, repo, branch, e.path))
    const images = Array.from(new Set([...dirImages, ...readmeImages])).slice(
      0,
      MAX_README_IMAGES
    )

    const record: PluginRecord = {
      id,
      repo: entry.repo,
      path: entry.path,
      url: `https://github.com/${entry.repo}${entry.path ? `/tree/${branch}/${entry.path}` : ""}`,
      name: id,
      description:
        pkg?.description ??
        manifestDescription ??
        firstParagraph(readme ?? "") ??
        "",
      version: pkg?.version,
      author: authorName(pkg?.author),
      license: repoMeta.license?.spdx_id ?? pkg?.license,
      categories: entry.categories,
      platforms: entry.platforms,
      caveats: entry.caveats,
      paseoVersionRequirement,
      manifest: (manifest as PluginRecord["manifest"]) ?? undefined,
      readmeText,
      readmeHtml,
      health: {
        manifestValid: manifestId === id,
        hasReadme: Boolean(readme),
        hasLicense: hasLicenseFile || Boolean(repoMeta.license),
        hasTests:
          Boolean(pkg?.scripts?.test) ||
          dirEntries.some((e) => /test/i.test(e.name)),
        hasTypecheckScript: Boolean(pkg?.scripts?.typecheck),
        updatedRecently: isRecent(repoMeta.pushed_at),
      },
      security,
      images,
      videos,
      installNotes,
      installNotesHtml,
      limitationsNotes,
      limitationsNotesHtml,
      owner: {
        login: repoMeta.owner.login,
        avatarUrl: repoMeta.owner.avatar_url,
        url: repoMeta.owner.html_url,
      },
      repoMeta: {
        stars: repoMeta.stargazers_count,
        openIssues: repoMeta.open_issues_count,
        defaultBranch: branch,
        pushedAt: repoMeta.pushed_at,
        topics: repoMeta.topics,
        archived: repoMeta.archived,
        license: repoMeta.license?.spdx_id ?? null,
      },
      scannedAt,
    }

    if (!manifestId) {
      record.scanError = "paseo-plugin.json missing or missing an 'id' field"
    } else if (manifestId !== id) {
      record.scanError = `paseo-plugin.json id "${manifestId}" must match registry ID "${id}"`
    }

    return pluginRecordSchema.parse(record)
  } catch (err) {
    const message =
      err instanceof GitHubNotFoundError
        ? `repo/path not found on GitHub: ${entry.repo}${entry.path ? `/${entry.path}` : ""}`
        : `scan failed: ${(err as Error).message}`
    return pluginRecordSchema.parse({ ...base, scanError: message })
  }
}

/** Renders one OG image and writes it to public/og/<slug>.png. Never fails the run — a broken render just logs and moves on. */
async function writeOgImage(
  slug: string,
  opts: Parameters<typeof renderOgImage>[0]
) {
  try {
    const png = await renderOgImage(opts)
    writeFileSync(join(OG_DIR, `${slug}.png`), png)
  } catch (err) {
    console.warn(
      `  ! failed to render OG image for ${slug}: ${(err as Error).message}`
    )
  }
}

function writeSitemap(records: PluginRecord[]) {
  const staticPages = [
    { path: "/", changefreq: "daily" },
    { path: "/submit", changefreq: "monthly" },
  ]

  const urls = [
    ...staticPages.map(
      ({ path, changefreq }) =>
        `  <url><loc>${SITE_URL}${path}</loc><changefreq>${changefreq}</changefreq></url>`
    ),
    ...records.map(
      (r) =>
        `  <url><loc>${SITE_URL}/plugins/${r.id}</loc><lastmod>${(r.repoMeta?.pushedAt ?? r.scannedAt).slice(0, 10)}</lastmod></url>`
    ),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
  writeFileSync(join(PUBLIC_DIR, "sitemap.xml"), xml)
  writeFileSync(
    join(PUBLIC_DIR, "robots.txt"),
    `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
  )
}

async function main() {
  const files = readdirSync(REGISTRY_DIR).filter((file) =>
    file.endsWith(".json")
  )
  const outputExists =
    existsSync(INDEX_PATH) &&
    existsSync(join(PUBLIC_DIR, "sitemap.xml")) &&
    existsSync(join(PUBLIC_DIR, "robots.txt")) &&
    existsSync(join(OG_DIR, "default.png")) &&
    files.every((file) => {
      const id = file.slice(0, -".json".length)
      return (
        existsSync(join(OUTPUT_DIR, `${id}.json`)) &&
        existsSync(join(OG_DIR, `${id}.png`))
      )
    })

  if (process.argv.includes("--if-missing") && outputExists) return
  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(OG_DIR, { recursive: true })

  const securityCatalog = loadPublishedSecurityCatalog()

  const records: PluginRecord[] = []
  for (const file of files) {
    console.log(`Scanning ${file}...`)
    const record = await scanOne(file, securityCatalog)
    if (record.scanError) console.warn(`  ! ${record.scanError}`)
    records.push(record)
    writeFileSync(
      join(OUTPUT_DIR, `${record.id}.json`),
      `${JSON.stringify(record, null, 2)}\n`
    )
    await writeOgImage(record.id, {
      title: record.name,
      description: record.description,
      badges: [
        ...record.platforms.map((p) => PLATFORM_LABELS[p]),
        ...record.categories,
        ...(record.license ? [record.license] : []),
      ],
    })
  }

  records.sort((a, b) => a.name.localeCompare(b.name))
  writeFileSync(INDEX_PATH, `${JSON.stringify(records, null, 2)}\n`)

  await writeOgImage("default", {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  })
  writeSitemap(records)

  const ok = records.filter((r) => !r.scanError).length
  console.log(
    `\nWrote ${records.length} record(s) (${ok} clean, ${records.length - ok} with warnings) to data/plugins.json`
  )
  console.log(
    `Wrote ${records.length + 1} OG image(s), sitemap.xml, and robots.txt to public/`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
