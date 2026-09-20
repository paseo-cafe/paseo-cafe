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
 *
 * `--limit N` caps how many entries a run scans (see parseLimitArg) — used
 * by `bun run dev:light` so local dev doesn't wait on the whole registry.
 */
import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { basename, join } from "node:path"
import { z } from "zod"
import { CATALOG_DESCRIPTION_MAX_LENGTH } from "../plugin/shared/catalog.ts"
import { inlineMarkdownToPlainText } from "../plugin/shared/inline-markdown.ts"
import {
  extractReadmeImages,
  isTrustedRemoteImageUrl,
  MAX_README_IMAGES,
  resolveGitHubAssetImages,
} from "../src/lib/images.ts"
import { parseInlineMarkdown } from "../src/lib/inline-markdown.ts"
import { renderMarkdownToHtml } from "../src/lib/markdown.ts"
import type {
  PluginNpmSecurity,
  PluginRecord,
  PluginSecurity,
} from "../src/lib/plugin-schema.ts"
import {
  gitCommitSchema,
  normalizePluginVersion,
  pluginNpmSecuritySchema,
  pluginOwnerLogin,
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
import {
  BASE_PATH,
  IS_CANONICAL_DEPLOYMENT,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
} from "../src/lib/site.ts"
import { extractVideos, resolveGitHubAssetVideos } from "../src/lib/videos.ts"
import {
  fetchRawJson,
  fetchRawText,
  fetchRepoMeta,
  GitHubNotFoundError,
  ghApi,
  listDir,
  rawUrl,
  resolveGitHubAssetContentType,
} from "./github.ts"
import {
  type NpmPackageRelease,
  resolveNpmDownloadsLast30Days,
  resolveNpmPackageReleases,
} from "./npm-registry.ts"
import { renderOgImage } from "./og-image.tsx"
import { securityResultsSchema } from "./plugin-security/shared.ts"
import {
  assertScanPlanIntegrity,
  type CandidateScanResults,
  candidateScanResultsSchema,
  type RegistryScanState,
  readScanState,
  registryScanStateSchema,
  type ScanPlan,
  type ScanPlanEntry,
  scanPlanSchema,
} from "./scan-plan.ts"
import { extractThemePreviews } from "./theme-previews.ts"

// Scripts are always invoked via `bun run` from the repo root (see package.json).
const ROOT = process.cwd()
const REGISTRY_DIR = join(ROOT, "registry")
const OUTPUT_DIR = join(ROOT, "data", "plugins")

const SECURITY_ARTIFACT_PATH = join(
  ROOT,
  "data",
  "plugin-security-results.json"
)
const REPOSITORY_COMMIT_SCHEMA = z.object({ sha: gitCommitSchema })

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/

/** True only for a clone whose history was truncated — see readRegistryAddedAt. */
function isShallowRepository(directory: string): boolean {
  try {
    return (
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: directory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true"
    )
  } catch {
    // No git, or not a work tree. readRegistryAddedAt's own git call fails
    // next and returns an empty map, which is the same answer.
    return false
  }
}

/**
 * When each registry entry first landed in git, keyed by its filename —
 * the catalog's "added to the directory" date. Derived rather than
 * hand-authored so every existing entry has a real date and no submitter can
 * date their own listing to the top of "Recently added".
 *
 * One first-parent `git log` pass covers the whole registry. Merge commits are
 * diffed against their first parent, so a preserved contributor commit cannot
 * supply its own listing date. Commits arrive newest-first, so the last date
 * written for a file is its earliest add, which survives delete-and-re-add.
 *
 * A shallow clone is refused rather than read. Its grafted root commit
 * appears to add every tracked file at once, so `git log` reports the entire
 * registry as added on the day the clone was made: every listing stamped
 * with the build date, "Recently added" collapsed into one big tie, and
 * nothing in the output to say so. An unknown date has to stay unknown, so
 * this returns an empty map there — same as a checkout with no git at all.
 */
export function readRegistryAddedAt(
  registryDir = REGISTRY_DIR
): Map<string, string> {
  const addedAt = new Map<string, string>()
  if (isShallowRepository(registryDir)) return addedAt

  let log: string
  try {
    log = execFileSync(
      "git",
      [
        "log",
        "--first-parent",
        "-m",
        "--diff-filter=A",
        // Committer date on the integration history: when the entry landed on
        // the catalog branch, not when a contributor authored or committed it.
        "--format=%cI",
        "--name-only",
        "--",
        registryDir,
      ],
      {
        // Anywhere inside the work tree resolves the same repository; using
        // the registry directory itself keeps the function testable against
        // a throwaway repo.
        cwd: registryDir,
        encoding: "utf8",
        maxBuffer: 32 * 1_024 * 1_024,
        stdio: ["ignore", "pipe", "ignore"],
      }
    )
  } catch {
    return addedAt
  }

  let commitDate: string | undefined
  for (const line of log.split("\n")) {
    const value = line.trim()
    if (value === "") continue
    if (ISO_TIMESTAMP_PATTERN.test(value)) {
      const parsed = Date.parse(value)
      commitDate =
        Number.isFinite(parsed) && parsed <= Date.now() ? value : undefined
    } else if (commitDate && value.endsWith(".json")) {
      addedAt.set(basename(value), commitDate)
    }
  }

  return addedAt
}

export function securityForRevision(
  security: PluginSecurity | undefined,
  revision: string
): PluginSecurity | undefined {
  if (security === undefined) return undefined
  const normalizedRevision = gitCommitSchema.safeParse(revision)
  if (!normalizedRevision.success) return undefined

  if (security.commit === undefined) {
    return security.status === "unknown"
      ? { status: "unknown", blockingFindings: 0, advisoryFindings: 0 }
      : undefined
  }

  const normalizedCommit = gitCommitSchema.safeParse(security.commit)
  if (
    !normalizedCommit.success ||
    normalizedCommit.data !== normalizedRevision.data
  ) {
    return undefined
  }
  return security
}

export function loadPublishedSecurityCatalog(
  artifactPath = SECURITY_ARTIFACT_PATH
): Record<string, PluginSecurity> {
  if (!existsSync(artifactPath)) return {}

  try {
    const result = securityResultsSchema.safeParse(
      JSON.parse(readFileSync(artifactPath, "utf8")) as unknown
    )
    if (!result.success) return {}

    return Object.fromEntries(
      Object.entries(result.data.plugins).map(([id, security]) => [
        id,
        pluginSecuritySchema.parse({
          status:
            security.status === "unavailable" ? "unknown" : security.status,
          blockingFindings: security.blockingFindings,
          advisoryFindings: security.advisoryFindings,
          scannedAt: security.scannedAt,
          commit: security.commit,
        }),
      ])
    )
  } catch {
    return {}
  }
}
export function loadPublishedNpmSecurityCatalog(
  artifactPath = SECURITY_ARTIFACT_PATH
): Record<string, PluginNpmSecurity & { package: string }> {
  if (!existsSync(artifactPath)) return {}
  try {
    const result = securityResultsSchema.safeParse(
      JSON.parse(readFileSync(artifactPath, "utf8")) as unknown
    )
    if (!result.success) return {}
    return Object.fromEntries(
      Object.entries(result.data.plugins).flatMap(([id, security]) => {
        if (!security.npm) return []
        return [
          [
            id,
            {
              package: security.npm.package,
              ...pluginNpmSecuritySchema.parse({
                status:
                  security.npm.status === "unavailable"
                    ? "unknown"
                    : security.npm.status,
                blockingFindings: security.npm.blockingFindings,
                advisoryFindings: security.npm.advisoryFindings,
                scannedAt: security.npm.scannedAt,
                version: security.npm.version,
                integrity: security.npm.integrity,
              }),
            },
          ],
        ]
      })
    )
  } catch {
    return {}
  }
}

export function loadPublishedNpmPreviewSecurityCatalog(
  artifactPath = SECURITY_ARTIFACT_PATH
): Record<string, PluginNpmSecurity & { package: string }> {
  if (!existsSync(artifactPath)) return {}
  try {
    const result = securityResultsSchema.safeParse(
      JSON.parse(readFileSync(artifactPath, "utf8")) as unknown
    )
    if (!result.success) return {}
    return Object.fromEntries(
      Object.entries(result.data.plugins).flatMap(([id, security]) => {
        if (!security.npmPreview) return []
        const npm = security.npmPreview
        return [
          [
            id,
            {
              package: npm.package,
              ...pluginNpmSecuritySchema.parse({
                status: npm.status === "unavailable" ? "unknown" : npm.status,
                blockingFindings: npm.blockingFindings,
                advisoryFindings: npm.advisoryFindings,
                scannedAt: npm.scannedAt,
                version: npm.version,
                integrity: npm.integrity,
              }),
            },
          ],
        ]
      })
    )
  } catch {
    return {}
  }
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
interface NpmCatalogMetrics {
  publishedAt?: string
  downloadsLast30Days?: number
}

export interface PinnedScanSource {
  commit?: string
  npmLatest?: NpmPackageRelease
  npmPreview?: NpmPackageRelease
}

export function npmReleaseIsReady(
  release: NpmPackageRelease,
  gitVersion: string | undefined,
  security: (PluginNpmSecurity & { package: string }) | undefined,
  metrics: NpmCatalogMetrics
): boolean {
  return (
    metrics.publishedAt !== undefined &&
    gitVersion === release.version &&
    security?.package === release.package &&
    security.version === release.version &&
    security.integrity === release.integrity &&
    security.status === "passed"
  )
}

export async function scanOne(
  entryFile: string,
  securityCatalog: Record<string, PluginSecurity>,
  registryDir = REGISTRY_DIR,
  addedAt?: string,
  offline = false,
  npmSecurityCatalog: Record<
    string,
    PluginNpmSecurity & { package: string }
  > = {},
  npmPreviewSecurityCatalog: Record<
    string,
    PluginNpmSecurity & { package: string }
  > = {},
  pinned?: PinnedScanSource
): Promise<PluginRecord> {
  const id = registryIdSchema.parse(entryFile.slice(0, -".json".length))
  const raw = JSON.parse(readFileSync(join(registryDir, entryFile), "utf8"))
  const entry = registryEntrySchema.parse(raw)
  const [owner, repo] = entry.repo.split("/")
  const scannedAt = new Date().toISOString()
  const prefix = entry.path ? `${entry.path}/` : ""

  const base: PluginRecord = {
    id,
    repo: entry.repo,
    path: entry.path,
    url: `https://github.com/${entry.repo}`,
    name: id,
    description: "",
    descriptionNodes: [],
    categories: entry.categories,
    platforms: entry.platforms,
    caveats: entry.caveats,
    caveatNodes: entry.caveats.map(parseInlineMarkdown),
    health: {
      manifestValid: false,
      hasReadme: false,
      hasLicense: false,
      hasTests: false,
      hasTypecheckScript: false,
      updatedRecently: false,
    },
    images: [],
    themes: [],
    videos: [],
    addedAt,
    scannedAt,
  }
  if (offline) return pluginRecordSchema.parse(base)

  try {
    let npmRelease: NpmPackageRelease | undefined
    let npmPreviewRelease: NpmPackageRelease | undefined
    let npmResolutionError: string | undefined
    let npmDownloadsLast30Days: number | undefined
    const npmMetricsErrors: string[] = []
    if (entry.package) {
      if (pinned) {
        npmRelease = pinned.npmLatest
        npmPreviewRelease = pinned.npmPreview
      } else {
        try {
          const releases = await resolveNpmPackageReleases(entry.package)
          npmRelease = releases.latest
          npmPreviewRelease =
            releases.latest &&
            releases.next &&
            releases.next.version !== releases.latest.version
              ? releases.next
              : undefined
          if (!npmRelease) throw new Error("latest release is unavailable")
        } catch (error) {
          npmResolutionError =
            error instanceof Error ? error.message : String(error)
        }
      }
      if (npmRelease) {
        try {
          npmDownloadsLast30Days = await resolveNpmDownloadsLast30Days(
            entry.package
          )
        } catch {
          console.warn(`  ! npm downloads unavailable for ${entry.package}`)
          npmMetricsErrors.push("download count")
        }
      }
    }
    const repoMeta = await fetchRepoMeta(owner, repo)
    const branch = repoMeta.default_branch
    const repositoryUrl = entry.path
      ? `https://github.com/${entry.repo}/tree/${branch}/${entry.path}`
      : `https://github.com/${entry.repo}`
    let revision: string | undefined
    let revisionError: string | undefined
    if (pinned) {
      revision = pinned.commit
    } else {
      try {
        revision = REPOSITORY_COMMIT_SCHEMA.parse(
          await ghApi<unknown>(
            `/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`
          )
        ).sha
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(
          `  ! commit resolution failed for ${entry.repo}: ${reason}`
        )
        revisionError =
          `default branch commit unavailable; scanned ${branch} without security ` +
          "attestation or repository-hosted images"
      }
    }

    const contentRef = revision ?? branch
    const dirEntries = await listDir(owner, repo, entry.path ?? "", contentRef)
    const byName = new Map(dirEntries.map((entry) => [entry.name, entry]))

    const manifest = await fetchRawJson<Record<string, unknown>>(
      owner,
      repo,
      contentRef,
      `${prefix}paseo-plugin.json`
    )
    const pkg = await fetchRawJson<PackageJson>(
      owner,
      repo,
      contentRef,
      `${prefix}package.json`
    )

    const readmeEntry = byName.get("README.md") ?? byName.get("readme.md")
    const readme = readmeEntry
      ? await fetchRawText(owner, repo, contentRef, readmeEntry.path)
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
      revision && imagesDirEntry?.type === "dir"
        ? await listDir(owner, repo, imagesDirEntry.path, revision)
        : []
    const clientEntry =
      byName.get("index.client.ts") ?? byName.get("index.client.tsx")
    const clientSource =
      clientEntry &&
      entry.categories.some(
        (category) => category.trim().toLowerCase() === "theme"
      )
        ? await fetchRawText(owner, repo, contentRef, clientEntry.path)
        : null
    const themes = clientSource ? extractThemePreviews(clientSource) : []

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
    const readmeImages = [...readmeImageRefs, ...readmeAssetImages].flatMap(
      (ref) => {
        if (/^https?:\/\//i.test(ref)) {
          return isTrustedRemoteImageUrl(ref) ? [ref] : []
        }
        if (!revision) return []
        const rootRelative = ref.startsWith("/")
        const cleaned = ref
          .replace(/^\.\//, "")
          .replace(/^\//, "")
          .replace(/[#?].*$/, "")
        return [
          rawUrl(
            owner,
            repo,
            revision,
            rootRelative ? cleaned : `${prefix}${cleaned}`
          ),
        ]
      }
    )
    const dirImages = revision
      ? imageDirEntries
          .filter((entry) => entry.type === "file")
          .map((entry) => rawUrl(owner, repo, revision, entry.path))
      : []
    const images = Array.from(new Set([...dirImages, ...readmeImages])).slice(
      0,
      MAX_README_IMAGES
    )
    const gitVersion = normalizePluginVersion(pkg?.version)
    const candidateNpmSecurity = npmRelease ? npmSecurityCatalog[id] : undefined
    const npmSecurityMatches = Boolean(
      npmRelease &&
        candidateNpmSecurity?.package === npmRelease.package &&
        candidateNpmSecurity.version === npmRelease.version &&
        candidateNpmSecurity.integrity === npmRelease.integrity &&
        candidateNpmSecurity.status === "passed"
    )
    const npmReady = Boolean(
      npmRelease &&
        npmReleaseIsReady(npmRelease, gitVersion, candidateNpmSecurity, {
          publishedAt: npmRelease.publishedAt,
          downloadsLast30Days: npmDownloadsLast30Days,
        })
    )
    const candidateNpmPreviewSecurity = npmPreviewRelease
      ? npmPreviewSecurityCatalog[id]
      : undefined
    const npmPreviewReady = Boolean(
      npmReady &&
        npmPreviewRelease?.publishedAt &&
        candidateNpmPreviewSecurity?.package === npmPreviewRelease.package &&
        candidateNpmPreviewSecurity.version === npmPreviewRelease.version &&
        candidateNpmPreviewSecurity.integrity === npmPreviewRelease.integrity &&
        candidateNpmPreviewSecurity.status === "passed"
    )
    const version = npmReady ? npmRelease?.version : gitVersion
    // Bounded here, where a third party's text enters the catalog.
    const description = (
      pkg?.description ??
      manifestDescription ??
      firstParagraph(readme ?? "") ??
      ""
    ).slice(0, CATALOG_DESCRIPTION_MAX_LENGTH)
    const record: PluginRecord = {
      id,
      repo: entry.repo,
      path: entry.path,
      package: npmReady ? entry.package : undefined,
      npm:
        npmReady && npmRelease
          ? {
              package: npmRelease.package,
              version: npmRelease.version,
              integrity: npmRelease.integrity,
              publishedAt: npmRelease.publishedAt,
              downloadsLast30Days: npmDownloadsLast30Days,
            }
          : undefined,
      npmSecurity: npmReady ? candidateNpmSecurity : undefined,
      npmPreview:
        npmPreviewReady && npmPreviewRelease?.publishedAt
          ? {
              package: npmPreviewRelease.package,
              version: npmPreviewRelease.version,
              integrity: npmPreviewRelease.integrity,
              distTag: "next",
              publishedAt: npmPreviewRelease.publishedAt,
            }
          : undefined,
      npmPreviewSecurity: npmPreviewReady
        ? candidateNpmPreviewSecurity
        : undefined,
      url: repositoryUrl,
      name: id,
      description,
      // Markdown is read exactly once, here; every surface renders these.
      descriptionNodes: parseInlineMarkdown(description),
      version,
      author: authorName(pkg?.author),
      license: repoMeta.license?.spdx_id ?? pkg?.license,
      categories: entry.categories,
      platforms: entry.platforms,
      caveats: entry.caveats,
      caveatNodes: entry.caveats.map(parseInlineMarkdown),
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
          dirEntries.some((entry) => /test/i.test(entry.name)),
        hasTypecheckScript: Boolean(pkg?.scripts?.typecheck),
        updatedRecently:
          npmReady && npmRelease
            ? npmRelease.publishedAt !== undefined &&
              isRecent(npmRelease.publishedAt)
            : isRecent(repoMeta.pushed_at),
      },
      security: revision
        ? securityForRevision(securityCatalog[id], revision)
        : undefined,
      images,
      themes,
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
      addedAt,
      scannedAt,
    }

    const scanErrors = revisionError ? [revisionError] : []
    if (npmResolutionError) {
      scanErrors.push(`npm package unavailable: ${npmResolutionError}`)
    }
    if (npmMetricsErrors.length > 0) {
      scanErrors.push(
        `npm ranking metadata unavailable: ${npmMetricsErrors.join(", ")}`
      )
    }
    if (!manifestId) {
      scanErrors.push("paseo-plugin.json missing or missing an 'id' field")
    } else if (manifestId !== id) {
      scanErrors.push(
        `paseo-plugin.json id "${manifestId}" must match registry ID "${id}"`
      )
    }
    if (version === "0.0.0") {
      scanErrors.push(
        'package.json version "0.0.0" is a placeholder; publish a real release version'
      )
    }
    if (npmRelease && gitVersion !== npmRelease.version) {
      scanErrors.push(
        `Git package version ${gitVersion ?? "missing"} does not match npm ${npmRelease.version}`
      )
    } else if (npmRelease && !npmSecurityMatches) {
      scanErrors.push(
        "npm package is waiting for a matching successful security scan"
      )
    }
    if (npmPreviewRelease && !npmPreviewReady) {
      console.warn(
        `  ! npm preview ${npmPreviewRelease.version} is waiting for a matching successful security scan`
      )
    }

    if (scanErrors.length > 0) record.scanError = scanErrors.join("; ")

    return pluginRecordSchema.parse(record)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const location = `${entry.repo}${entry.path ? `/${entry.path}` : ""}`
    console.warn(`  ! scan failed for ${location}: ${reason}`)
    const message =
      error instanceof GitHubNotFoundError
        ? `repo/path not found on GitHub: ${location}`
        : `scan failed while reading repository: ${location}`
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

/**
 * The static stand-in for the old /plugins listing URL, kept working for
 * bookmarks and inbound links. Generated rather than committed because both
 * the redirect target and the canonical URL depend on where this deployment
 * lives — a fork serving the site under /<repo>/ needs its own, not
 * paseo.cafe's. The app has a matching client-side redirect route
 * (src/routes/plugins.index.tsx); this covers the first, static hit.
 */
export function renderPluginsRedirect(): string {
  const target = `${SITE_URL}/`
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=${BASE_PATH}" />
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="${target}" />
    <title>Redirecting to ${SITE_NAME}</title>
  </head>
  <body>
    <p><a href="${BASE_PATH}">Browse ${SITE_NAME} plugins</a></p>
  </body>
</html>
`
}

function writePluginsRedirect() {
  mkdirSync(join(PUBLIC_DIR, "plugins"), { recursive: true })
  writeFileSync(
    join(PUBLIC_DIR, "plugins", "index.html"),
    renderPluginsRedirect()
  )
}

export function writeSitemap(records: PluginRecord[]) {
  const staticPages = [
    { path: "/", changefreq: "daily" },
    { path: "/submit", changefreq: "monthly" },
    { path: "/themes", changefreq: "weekly" },
  ]

  // One entry per distinct owner login — /user/$username pages are indexable
  // too, same as a plugin's own page (see plugins-data.ts's listPluginsByOwner).
  const ownerLogins = [...new Set(records.map(pluginOwnerLogin))].sort()

  const urls = [
    ...staticPages.map(
      ({ path, changefreq }) =>
        `  <url><loc>${SITE_URL}${path}</loc><changefreq>${changefreq}</changefreq></url>`
    ),
    ...records.map(
      (record) => `  <url><loc>${SITE_URL}/plugins/${record.id}</loc></url>`
    ),
    ...ownerLogins.map(
      (login) =>
        `  <url><loc>${SITE_URL}/user/${encodeURIComponent(login)}</loc></url>`
    ),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`
  writeFileSync(join(PUBLIC_DIR, "sitemap.xml"), xml)
  writeFileSync(join(PUBLIC_DIR, "robots.txt"), renderRobotsTxt())
}

/**
 * Crawlers get the catalog and its sitemap from the canonical site. A fork's
 * project-path robots.txt is advisory because robots rules are read only from
 * the origin root; rendered HTML also carries a noindex meta tag. The fork's
 * sitemap is still useful for checking a deployment by hand.
 */
export function renderRobotsTxt(): string {
  if (!IS_CANONICAL_DEPLOYMENT) {
    return `User-agent: *\nDisallow: /\n`
  }
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`
}

/**
 * True once a plugin has a valid cached record and OG image. Deliberately
 * does not require `scanError` to be unset: a scanError can be a persistent
 * catalog problem (mismatched manifest ID, placeholder version) rather than
 * a transient failure, and treating every scanError as "incomplete" would
 * make `--if-missing --limit N` retry the same broken entry every run,
 * burning the limit and starving entries that have never been scanned.
 */
export function isFullyScanned(
  file: string,
  outputDir = OUTPUT_DIR,
  ogDir = OG_DIR
): boolean {
  const id = file.slice(0, -".json".length)
  const record = readCachedRecord(id, outputDir)
  return (
    record !== undefined &&
    record.id === id &&
    existsSync(join(ogDir, `${id}.png`))
  )
}

/**
 * Loads a plugin's previously written data/plugins/<id>.json so it can be
 * folded into the aggregate index without rescanning it — used when a run
 * only covers part of the registry (see --limit).
 */
function readCachedRecord(
  id: string,
  outputDir = OUTPUT_DIR
): PluginRecord | undefined {
  const path = join(outputDir, `${id}.json`)
  if (!existsSync(path)) return undefined
  try {
    return pluginRecordSchema.parse(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return undefined
  }
}
function pluginSecurityFromCandidate(
  candidate: CandidateScanResults["plugins"][string]["git"]
): PluginSecurity | undefined {
  if (!candidate) return undefined
  return pluginSecuritySchema.parse({
    status:
      candidate.result.status === "unavailable"
        ? "unknown"
        : candidate.result.status,
    blockingFindings: candidate.result.blockingFindings,
    advisoryFindings: candidate.result.advisoryFindings,
    scannedAt: candidate.result.scannedAt,
    commit: candidate.result.commit,
  })
}

function npmSecurityFromCandidate(
  candidate:
    | CandidateScanResults["plugins"][string]["npmLatest"]
    | CandidateScanResults["plugins"][string]["npmPreview"]
): (PluginNpmSecurity & { package: string }) | undefined {
  if (!candidate) return undefined
  return {
    package: candidate.result.package,
    ...pluginNpmSecuritySchema.parse({
      status:
        candidate.result.status === "unavailable"
          ? "unknown"
          : candidate.result.status,
      blockingFindings: candidate.result.blockingFindings,
      advisoryFindings: candidate.result.advisoryFindings,
      scannedAt: candidate.result.scannedAt,
      version: candidate.result.version,
      integrity: candidate.result.integrity,
    }),
  }
}

function candidatePassed(
  candidate:
    | CandidateScanResults["plugins"][string]["git"]
    | CandidateScanResults["plugins"][string]["npmLatest"]
    | CandidateScanResults["plugins"][string]["npmPreview"],
  targetKey: string | undefined
): boolean {
  return Boolean(
    candidate &&
      targetKey &&
      candidate.targetKey === targetKey &&
      candidate.result.status === "passed" &&
      candidate.result.blockingFindings === 0
  )
}

function overlayRegistryFields(
  record: PluginRecord,
  entry: ScanPlanEntry["registry"]
): PluginRecord {
  return pluginRecordSchema.parse({
    ...record,
    categories: entry.categories,
    platforms: entry.platforms,
    caveats: entry.caveats,
    caveatNodes: entry.caveats.map(parseInlineMarkdown),
  })
}
function npmRecordMatches(
  record: PluginRecord | undefined,
  release: NpmPackageRelease | undefined,
  preview = false
): boolean {
  const published = preview ? record?.npmPreview : record?.npm
  const security = preview ? record?.npmPreviewSecurity : record?.npmSecurity
  return Boolean(
    release &&
      published?.package === release.package &&
      published.version === release.version &&
      published.integrity === release.integrity &&
      security?.status === "passed" &&
      security.version === release.version &&
      security.integrity === release.integrity
  )
}

export async function assembleIncrementalCatalog(options: {
  plan: ScanPlan
  candidates: CandidateScanResults
  previousState?: RegistryScanState
  registryDir?: string
  outputDir?: string
  ogDir?: string
  statePath?: string
  indexPath?: string
  writeDeploymentFiles?: boolean
}): Promise<{ records: PluginRecord[]; publishedCount: number }> {
  const {
    plan,
    candidates,
    previousState,
    registryDir = REGISTRY_DIR,
    outputDir = OUTPUT_DIR,
    ogDir = OG_DIR,
    statePath = join(ROOT, "data", "registry-scan-state.json"),
    indexPath = INDEX_PATH,
    writeDeploymentFiles = true,
  } = options
  assertScanPlanIntegrity(plan)
  if (candidates.planId !== plan.planId) {
    throw new Error("candidate scan results do not match the pinned plan")
  }

  mkdirSync(outputDir, { recursive: true })
  mkdirSync(ogDir, { recursive: true })
  const addedAt = readRegistryAddedAt(registryDir)
  const records: PluginRecord[] = []
  const nextEntries: RegistryScanState["entries"] = {}
  let publishedCount = 0

  for (const entry of plan.entries) {
    const id = entry.registry.id
    const previous = previousState?.entries[id]
    const sourceChanged = previous?.sourceKey !== entry.sourceKey
    const active =
      plan.reusedState && !sourceChanged ? previous?.active : undefined
    const candidate = candidates.plugins[id]
    const latestTarget = entry.npmTargets.find(
      (target) => target.channel === "latest"
    )
    const previewTarget = entry.npmTargets.find(
      (target) => target.channel === "next"
    )
    if (
      (candidate?.git &&
        (candidate.git.targetKey !== entry.gitTarget?.targetKey ||
          candidate.git.result.commit !== entry.gitTarget.commit)) ||
      (candidate?.npmLatest &&
        (candidate.npmLatest.targetKey !== latestTarget?.targetKey ||
          candidate.npmLatest.result.package !== latestTarget.release.package ||
          candidate.npmLatest.result.version !== latestTarget.release.version ||
          candidate.npmLatest.result.integrity !==
            latestTarget.release.integrity)) ||
      (candidate?.npmPreview &&
        (candidate.npmPreview.targetKey !== previewTarget?.targetKey ||
          candidate.npmPreview.result.package !==
            previewTarget.release.package ||
          candidate.npmPreview.result.version !==
            previewTarget.release.version ||
          candidate.npmPreview.result.integrity !==
            previewTarget.release.integrity))
    ) {
      throw new Error(`candidate target mismatch for ${id}`)
    }
    const storedGitCandidate = previous?.lastAttempt?.git
    const priorGitCandidate =
      storedGitCandidate &&
      entry.observedGit &&
      storedGitCandidate.targetKey === entry.observedGit.targetKey &&
      storedGitCandidate.result.commit === entry.observedGit.commit
        ? storedGitCandidate
        : undefined
    const storedNpmLatest = previous?.lastAttempt?.npmLatest
    const priorNpmLatest =
      storedNpmLatest &&
      entry.observedNpmLatest &&
      storedNpmLatest.targetKey === entry.observedNpmLatestKey &&
      storedNpmLatest.result.package === entry.observedNpmLatest.package &&
      storedNpmLatest.result.version === entry.observedNpmLatest.version &&
      storedNpmLatest.result.integrity === entry.observedNpmLatest.integrity
        ? storedNpmLatest
        : undefined
    const storedNpmPreview = previous?.lastAttempt?.npmPreview
    const priorNpmPreview =
      storedNpmPreview &&
      entry.observedNpmPreview &&
      storedNpmPreview.targetKey === entry.observedNpmPreviewKey &&
      storedNpmPreview.result.package === entry.observedNpmPreview.package &&
      storedNpmPreview.result.version === entry.observedNpmPreview.version &&
      storedNpmPreview.result.integrity === entry.observedNpmPreview.integrity
        ? storedNpmPreview
        : undefined
    const gitEvidence = candidate?.git ?? priorGitCandidate
    const npmLatestEvidence = candidate?.npmLatest ?? priorNpmLatest
    const npmPreviewEvidence = candidate?.npmPreview ?? priorNpmPreview
    const gitPassed = candidatePassed(gitEvidence, entry.observedGit?.targetKey)
    const npmLatestPassed = candidatePassed(
      npmLatestEvidence,
      entry.observedNpmLatestKey
    )
    const npmPreviewPassed = candidatePassed(
      npmPreviewEvidence,
      entry.observedNpmPreviewKey
    )
    const registryChanged = previous?.registryKey !== entry.registryKey
    const shouldPromoteGit = Boolean(
      !entry.registry.package &&
        gitPassed &&
        entry.observedGit &&
        active?.security?.commit !== entry.observedGit.commit
    )
    const shouldPromoteNpm = Boolean(
      entry.registry.package &&
        npmLatestPassed &&
        !npmRecordMatches(active, entry.observedNpmLatest)
    )
    const shouldGenerate =
      !active || sourceChanged || shouldPromoteGit || shouldPromoteNpm

    let record = active
    if (shouldGenerate) {
      const candidateGitSecurity = pluginSecurityFromCandidate(gitEvidence)
      const gitSecurity =
        candidateGitSecurity?.status === "passed"
          ? candidateGitSecurity
          : (active?.security ?? candidateGitSecurity)
      const npmSecurity = npmSecurityFromCandidate(npmLatestEvidence)
      const previewSecurity = npmSecurityFromCandidate(npmPreviewEvidence)
      const commit = gitSecurity?.commit ?? entry.observedGit?.commit
      const generated = await scanOne(
        `${id}.json`,
        gitSecurity ? { [id]: gitSecurity } : {},
        registryDir,
        addedAt.get(`${id}.json`),
        commit === undefined,
        npmSecurity ? { [id]: npmSecurity } : {},
        previewSecurity ? { [id]: previewSecurity } : {},
        {
          commit,
          npmLatest: entry.observedNpmLatest,
          npmPreview: entry.observedNpmPreview,
        }
      )
      const promotionSucceeded =
        (!shouldPromoteGit ||
          (generated.security?.status === "passed" &&
            generated.security.commit === entry.observedGit?.commit)) &&
        (!shouldPromoteNpm ||
          npmRecordMatches(generated, entry.observedNpmLatest))
      record = active && !promotionSucceeded ? active : generated
    } else if (record && npmPreviewPassed) {
      const gitSecurity = record.security
      const latestSecurity = record.npmSecurity
        ? { package: record.package as string, ...record.npmSecurity }
        : undefined
      const previewSecurity = npmSecurityFromCandidate(npmPreviewEvidence)
      const generated = await scanOne(
        `${id}.json`,
        gitSecurity ? { [id]: gitSecurity } : {},
        registryDir,
        addedAt.get(`${id}.json`),
        false,
        latestSecurity ? { [id]: latestSecurity } : {},
        previewSecurity ? { [id]: previewSecurity } : {},
        {
          commit: record.security?.commit ?? entry.observedGit?.commit,
          npmLatest: entry.observedNpmLatest,
          npmPreview: entry.observedNpmPreview,
        }
      )
      if (npmRecordMatches(generated, entry.observedNpmPreview, true)) {
        record = generated
      }
    }

    if (record && registryChanged) {
      record = overlayRegistryFields(record, entry.registry)
    }
    if (
      record &&
      entry.npmResolved &&
      !entry.observedNpmPreview &&
      record.npmPreview
    ) {
      const withoutPreview = { ...record }
      delete withoutPreview.npmPreview
      delete withoutPreview.npmPreviewSecurity
      record = pluginRecordSchema.parse(withoutPreview)
    }

    if (!record) continue
    record = pluginRecordSchema.parse(record)
    records.push(record)
    const oldSerialized = active ? JSON.stringify(active) : undefined
    if (JSON.stringify(record) !== oldSerialized) publishedCount += 1
    writeFileSync(
      join(outputDir, `${id}.json`),
      `${JSON.stringify(record, null, 2)}\n`
    )
    if (
      JSON.stringify(record) !== oldSerialized ||
      !existsSync(join(ogDir, `${id}.png`))
    ) {
      await writeOgImage(id, {
        title: record.name,
        description: inlineMarkdownToPlainText(record.descriptionNodes),
        badges: [
          ...record.platforms.map((platform) => PLATFORM_LABELS[platform]),
          ...record.categories,
          ...(record.license ? [record.license] : []),
        ],
      })
    }

    const lastAttempt = {
      ...(plan.reusedState && !sourceChanged ? previous?.lastAttempt : {}),
      ...(candidate?.git ? { git: candidate.git } : {}),
      ...(candidate?.npmLatest ? { npmLatest: candidate.npmLatest } : {}),
      ...(candidate?.npmPreview ? { npmPreview: candidate.npmPreview } : {}),
    }
    nextEntries[id] = {
      sourceKey: entry.sourceKey,
      registryKey: entry.registryKey,
      active: record,
      ...(Object.keys(lastAttempt).length > 0 ? { lastAttempt } : {}),
    }
  }

  records.sort((left, right) => left.name.localeCompare(right.name))
  writeFileSync(indexPath, `${JSON.stringify(records, null, 2)}\n`)
  if (writeDeploymentFiles) {
    await writeOgImage("default", {
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    })
    writeSitemap(records)
    writePluginsRedirect()
  }
  const state = registryScanStateSchema.parse({
    version: 1,
    generatedAt: new Date().toISOString(),
    registryDigest: plan.registryDigest,
    catalogDigest: plan.catalogDigest,
    securityDigest: plan.securityDigest,
    securityPolicyVersion: plan.securityPolicyVersion,
    entries: nextEntries,
  })
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
  return { records, publishedCount }
}

/**
 * `--limit N`: cap how many registry entries this run scans, for a fast
 * local `bun run dev:light` on a registry with hundreds of entries. Combined
 * with --if-missing, repeated light runs scan a fresh N entries each time
 * (in filename order) until the whole registry is warm, without ever paying
 * for a full scan up front. The aggregate index/sitemap only ever list
 * entries that have actually been scanned at least once.
 */
function parseLimitArg(): number | undefined {
  const flagIndex = process.argv.indexOf("--limit")
  if (flagIndex === -1) return undefined
  const raw = process.argv[flagIndex + 1]
  const value = raw ? Number(raw) : Number.NaN
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("--limit requires a positive integer, e.g. --limit 20")
  }
  return value
}

function valueFor(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

async function main() {
  const planPath = valueFor(process.argv, "--plan")
  if (planPath) {
    const candidatesPath = valueFor(process.argv, "--candidates")
    const statePath =
      valueFor(process.argv, "--state") ??
      join(ROOT, "data", "registry-scan-state.json")
    const plan = scanPlanSchema.parse(
      JSON.parse(readFileSync(planPath, "utf8"))
    )
    const candidates =
      candidatesPath && existsSync(candidatesPath)
        ? candidateScanResultsSchema.parse(
            JSON.parse(readFileSync(candidatesPath, "utf8"))
          )
        : candidateScanResultsSchema.parse({
            version: 1,
            planId: plan.planId,
            generatedAt: new Date().toISOString(),
            plugins: {},
          })
    const previousState = readScanState(statePath)
    const result = await assembleIncrementalCatalog({
      plan,
      candidates,
      previousState,
      statePath,
    })
    if (process.env.GITHUB_OUTPUT) {
      writeFileSync(
        process.env.GITHUB_OUTPUT,
        `published_count=${result.publishedCount}\n`,
        { flag: "a" }
      )
    }
    console.log(
      `Published ${result.publishedCount} changed record(s); catalog contains ${result.records.length} plugin(s).`
    )
    return
  }
  if (process.argv.includes("--deployment-files-only")) {
    const records = pluginRecordSchema
      .array()
      .parse(JSON.parse(readFileSync(INDEX_PATH, "utf8")))
    writeSitemap(records)
    writePluginsRedirect()
    return
  }

  const files = readdirSync(REGISTRY_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
  const useIfMissing = process.argv.includes("--if-missing")
  const limit = parseLimitArg()

  let filesToScan = useIfMissing
    ? files.filter((file) => !isFullyScanned(file))
    : files
  if (limit !== undefined) filesToScan = filesToScan.slice(0, limit)

  const staticFilesReady =
    existsSync(INDEX_PATH) &&
    existsSync(join(PUBLIC_DIR, "sitemap.xml")) &&
    existsSync(join(PUBLIC_DIR, "robots.txt")) &&
    existsSync(join(PUBLIC_DIR, "plugins", "index.html")) &&
    existsSync(join(OG_DIR, "default.png"))

  if (
    useIfMissing &&
    limit === undefined &&
    filesToScan.length === 0 &&
    staticFilesReady
  ) {
    return
  }

  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(OG_DIR, { recursive: true })

  const securityCatalog = loadPublishedSecurityCatalog()
  const npmSecurityCatalog = loadPublishedNpmSecurityCatalog()
  const npmPreviewSecurityCatalog = loadPublishedNpmPreviewSecurityCatalog()
  const addedAt = readRegistryAddedAt()
  if (addedAt.size === 0 && files.length > 0) {
    console.warn(
      "  ! no registry history in git (shallow clone?) — every plugin will be listed without an added date"
    )
  }
  const offline = process.argv.includes("--offline")

  const scanned = new Map<string, PluginRecord>()
  for (const file of filesToScan) {
    console.log(`Scanning ${file}...`)
    const record = await scanOne(
      file,
      securityCatalog,
      REGISTRY_DIR,
      addedAt.get(file),
      offline,
      npmSecurityCatalog,
      npmPreviewSecurityCatalog
    )
    if (record.scanError) console.warn(`  ! ${record.scanError}`)
    scanned.set(record.id, record)
    writeFileSync(
      join(OUTPUT_DIR, `${record.id}.json`),
      `${JSON.stringify(record, null, 2)}\n`
    )
    await writeOgImage(record.id, {
      title: record.name,
      // satori paints flat text: the plain form, and nothing at all when
      // the description had no visible text (an image-only one, say).
      description: inlineMarkdownToPlainText(record.descriptionNodes),
      badges: [
        ...record.platforms.map((p) => PLATFORM_LABELS[p]),
        ...record.categories,
        ...(record.license ? [record.license] : []),
      ],
    })
  }

  // The aggregate index covers everything scanned in this run plus anything
  // already cached from a prior run; a registry entry that's never been
  // scanned yet is simply left out (that's the point of --limit).
  const records = files
    .map((file) => {
      const id = file.slice(0, -".json".length)
      return scanned.get(id) ?? readCachedRecord(id)
    })
    .filter((record): record is PluginRecord => record !== undefined)
  records.sort((a, b) => a.name.localeCompare(b.name))
  writeFileSync(INDEX_PATH, `${JSON.stringify(records, null, 2)}\n`)

  await writeOgImage("default", {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  })
  writeSitemap(records)
  writePluginsRedirect()

  const ok = records.filter((r) => !r.scanError).length
  const coverage =
    records.length < files.length
      ? ` (${files.length - records.length} of ${files.length} registry entries not yet scanned — run \`bun run registry:scan\` for the full catalog)`
      : ""
  console.log(
    `\nWrote ${records.length} record(s) (${ok} clean, ${records.length - ok} with warnings) to data/plugins.json${coverage}`
  )
  console.log(
    `Wrote ${scanned.size} OG image(s) this run, plus sitemap.xml, robots.txt, and plugins/index.html to public/`
  )
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
