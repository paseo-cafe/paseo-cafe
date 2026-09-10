import { z } from "zod"
import { PLATFORMS } from "@/lib/registry-schema"

/**
 * The enriched, generated record for one plugin. Never hand-authored — the
 * scanner (scripts/scan.ts) produces data/plugins/<id>.json in this shape by
 * reading the plugin's paseo-plugin.json, package.json, README, LICENSE,
 * images/, and the GitHub repo API. The site only ever reads this shape.
 */
export const pluginHealthSchema = z.object({
  manifestValid: z.boolean(),
  hasReadme: z.boolean(),
  hasLicense: z.boolean(),
  hasTests: z.boolean(),
  hasTypecheckScript: z.boolean(),
  updatedRecently: z.boolean(),
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
  version: z.string().optional(),
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
  health: pluginHealthSchema,
  images: z.array(z.string()).default([]),
  videos: z.array(videoEmbedSchema).default([]),
  scanError: z.string().optional(),
  scannedAt: z.string(),
})

export type PluginHealth = z.infer<typeof pluginHealthSchema>
export type PluginRepoMeta = z.infer<typeof pluginRepoMetaSchema>
export type PluginOwner = z.infer<typeof pluginOwnerSchema>
export type VideoEmbed = z.infer<typeof videoEmbedSchema>
export type PluginRecord = z.infer<typeof pluginRecordSchema>
