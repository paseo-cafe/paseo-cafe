import * as semver from "semver"
import { z } from "zod"
import { PLATFORMS } from "@/lib/registry-schema"
import {
  CATALOG_VERSION_MAX_LENGTH,
  type CatalogHealthCheck,
} from "../../plugin/shared/catalog"

/**
 * The enriched, generated record for one plugin. Never hand-authored — the
 * scanner (scripts/scan.ts) produces data/plugins/<id>.json in this shape by
 * reading the plugin's paseo-plugin.json, package.json, README, LICENSE,
 * images/, and the GitHub repo API. The site only ever reads this shape.
 */
const pluginHealthShape = {
  manifestValid: z.boolean(),
  hasReadme: z.boolean(),
  hasLicense: z.boolean(),
  hasTests: z.boolean(),
  hasTypecheckScript: z.boolean(),
  updatedRecently: z.boolean(),
} satisfies Record<CatalogHealthCheck, z.ZodType<boolean>>

export const pluginHealthSchema = z.object(pluginHealthShape)

const httpUrlSchema = z
  .string()
  .url()
  .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
    message: "Must be an http(s) URL",
  })

export const gitCommitSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{40}$/i, "Must be a full Git commit SHA")
  .transform((commit) => commit.toLowerCase())

export function normalizePluginVersion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  return semver.valid(value) ?? undefined
}

export const pluginSecuritySchema = z
  .object({
    status: z.enum(["passed", "failed", "unknown"]),
    blockingFindings: z.number().int().nonnegative(),
    advisoryFindings: z.number().int().nonnegative(),
    scannedAt: z.string().optional(),
    commit: gitCommitSchema.optional(),
    reportUrl: httpUrlSchema.optional(),
  })
  .superRefine((security, ctx) => {
    if (security.status !== "unknown" && security.commit === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commit"],
        message: `status "${security.status}" requires a commit`,
      })
    }
    if (security.status === "passed" && security.blockingFindings > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockingFindings"],
        message: 'status "passed" cannot have blocking findings',
      })
    }
  })

export const pluginRepoMetaSchema = z.object({
  stars: z.number().int().nonnegative(),
  openIssues: z.number().int().nonnegative(),
  defaultBranch: z.string(),
  pushedAt: z.string(),
  topics: z.array(z.string()).default([]),
  archived: z.boolean().default(false),
  license: z.string().nullable().default(null),
})

/** The GitHub account that owns the plugin's repo — the one reliable "who made this" we always have. */
export const pluginOwnerSchema = z.object({
  login: z.string(),
  avatarUrl: z.string().url(),
  url: z.string().url(),
})

/**
 * A demo video found by best-effort scanning of the README (see
 * src/lib/videos.ts). URLs are always constructed from a matched, sanitized
 * ID (or a URL that itself matched an http(s) + known-video-extension
 * pattern) — never rendered from arbitrary README text directly.
 */
export const videoEmbedSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("youtube"),
    id: z.string(),
    embedUrl: z.string().url(),
    watchUrl: z.string().url(),
  }),
  z.object({
    kind: z.literal("loom"),
    id: z.string(),
    embedUrl: z.string().url(),
  }),
  z.object({ kind: z.literal("file"), url: z.string().url() }),
])

export const pluginRecordSchema = z.object({
  id: z.string(),
  repo: z.string(),
  path: z.string().optional(),
  url: z.string().url(),
  name: z.string(),
  description: z.string().default(""),
  version: z.string().max(CATALOG_VERSION_MAX_LENGTH).optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  categories: z.array(z.string()).default([]),
  // Author-declared in registry/<id>.json — see src/lib/registry-schema.ts.
  // Authoritative when present; limitationsNotes below is the best-effort
  // fallback for whatever the author didn't declare here.
  platforms: z.array(z.enum(PLATFORMS)).default([]),
  caveats: z.array(z.string()).default([]),
  // The plugin's own declared `requirements.paseo` from its paseo-plugin.json
  // (e.g. ">=0.8.0") — pulled out of `manifest` below at scan time so the
  // site/plugin can highlight it directly instead of everyone re-parsing
  // manifest.requirements.paseo themselves. See scripts/scan.ts.
  paseoVersionRequirement: z.string().optional(),
  manifest: z.record(z.string(), z.json()).optional(),
  repoMeta: pluginRepoMetaSchema.optional(),
  owner: pluginOwnerSchema.optional(),
  // Best-effort bounded copy of the plugin README markdown fetched at scan
  // time. readmeText is the sanitized-source markdown retained for display
  // and debugging, and readmeHtml is readmeText rendered through the shared
  // markdown sanitizer pipeline in src/lib/markdown.ts. The site renders only
  // the HTML field.
  readmeText: z.string().optional(),
  readmeHtml: z.string().optional(),
  health: pluginHealthSchema,
  // Best-effort excerpt of an "Install"/"Setup"/"Getting started" README
  // section — supplementary to the always-correct generated install
  // command (see src/lib/install-command.ts), for anything extra the
  // author called out (env vars, prerequisites, etc). installNotesHtml is
  // installNotes rendered to sanitized HTML at scan time (src/lib/markdown.ts)
  // — the only thing the site actually renders.
  installNotes: z.string().optional(),
  installNotesHtml: z.string().optional(),
  // Same idea, but for a "Limitations"/"Caveats"/"Known issues" README
  // section — the free, deterministic first line of defense for things like
  // "macOS only" that an author didn't declare via `platforms`/`caveats`
  // above. See src/lib/readme.ts's extractLimitationsSection.
  limitationsNotes: z.string().optional(),
  limitationsNotesHtml: z.string().optional(),
  security: pluginSecuritySchema.optional(),
  images: z.array(z.string()).default([]),
  videos: z.array(videoEmbedSchema).default([]),
  scanError: z.string().optional(),
  scannedAt: z.string(),
})

export type PluginHealth = z.infer<typeof pluginHealthSchema>
export type PluginSecurity = z.infer<typeof pluginSecuritySchema>
export type PluginRepoMeta = z.infer<typeof pluginRepoMetaSchema>
export type PluginOwner = z.infer<typeof pluginOwnerSchema>
export type VideoEmbed = z.infer<typeof videoEmbedSchema>
export type PluginRecord = z.infer<typeof pluginRecordSchema>

/**
 * The GitHub login a plugin's `/user/$username` page should use. `owner` is
 * absent when a scan failed and only the base record was retained (see
 * scripts/scan.ts's `base`) — fall back to the repo's own owner segment so
 * the link a plugin page generates always matches a real user page.
 */
export function pluginOwnerLogin(
  plugin: Pick<PluginRecord, "owner" | "repo">
): string {
  return plugin.owner?.login ?? plugin.repo.split("/")[0]
}
