import { defineRpc, defineSettings } from "@getpaseo/plugin"
import { z } from "zod"

export const DEFAULT_DIRECTORY_URL = "https://paseo.cafe/api/plugins"

// Always the real site, independent of directorySettings.directoryUrl above —
// "View on paseo.cafe" should never point at a local/staging override.
const SITE_URL = "https://paseo.cafe"

/**
 * Which paseo.cafe deployment to read from — host-scoped so it's one setting
 * per daemon, editable from Settings → Plugins → Plugin Directory without a
 * reload. Exists for local development (point at `npm run dev`) and for
 * anyone running a self-hosted fork of the directory.
 */
export const directorySettings = defineSettings({
  id: "directory-settings",
  scope: "host",
  version: 1,
  schema: z.object({
    directoryUrl: z.string().url().default(DEFAULT_DIRECTORY_URL),
  }),
})

/**
 * Trimmed mirror of the PluginRecord shape served by https://paseo.cafe/api/plugins
 * (see src/lib/plugin-schema.ts and src/routes/api.plugins.ts in the site). Only
 * the fields this surface actually renders — zod drops the rest, so the site can
 * grow its own schema without breaking this plugin.
 */
export const directoryEntrySchema = z.object({
  id: z.string(),
  repo: z.string(),
  path: z.string().optional(),
  url: z.string(),
  name: z.string(),
  description: z.string().default(""),
  author: z.string().optional(),
  categories: z.array(z.string()).default([]),
  platforms: z.array(z.string()).default([]),
  caveats: z.array(z.string()).default([]),
  license: z.string().optional(),
  // e.g. ">=0.8.0" — the plugin's own `requirements.paseo` from its
  // paseo-plugin.json (see scripts/scan.ts on the site). Highlighted the
  // same way as a platform restriction, not left for someone to dig out of
  // the README or the manifest themselves.
  paseoVersionRequirement: z.string().optional(),
  images: z.array(z.string()).default([]),
  // Pre-sanitized HTML rendered at scan time from the plugin's own README
  // (see src/lib/markdown.ts on the site) — this plugin has no HTML renderer,
  // so it's shown as stripped plain text (see stripHtml below) rather than
  // with the site's original formatting.
  installNotesHtml: z.string().optional(),
  limitationsNotesHtml: z.string().optional(),
  scanError: z.string().optional(),
  scannedAt: z.string().optional(),
  health: z
    .object({
      manifestValid: z.boolean().optional(),
      hasReadme: z.boolean().optional(),
      hasLicense: z.boolean().optional(),
      hasTests: z.boolean().optional(),
      hasTypecheckScript: z.boolean().optional(),
      updatedRecently: z.boolean().optional(),
    })
    .optional(),
  owner: z
    .object({
      login: z.string().optional(),
      avatarUrl: z.string().optional(),
    })
    .optional(),
  repoMeta: z
    .object({
      stars: z.number().int().nonnegative().optional(),
      pushedAt: z.string().optional(),
    })
    .optional(),
})

export type DirectoryEntry = z.infer<typeof directoryEntrySchema>

export const directoryListRpc = defineRpc({
  name: "directory.list",
  // baseUrl comes from the client's own directorySettings read — see
  // DirectorySurface.tsx — so the server doesn't need its own settings access.
  input: z.object({ baseUrl: z.string().url().optional() }),
  output: z.object({
    plugins: z.array(directoryEntrySchema),
    fetchedAt: z.string(),
  }),
})

export const directoryInstallRpc = defineRpc({
  name: "directory.install",
  input: z.object({
    repo: z.string(),
    path: z.string().optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    message: z.string(),
  }),
})

// GitHub "owner/repo" — one slash, conservative charset. Checked on both sides:
// the client disables Install for anything that fails this, and the server
// re-checks it right before exec'ing the CLI, since that's the boundary that
// actually matters (see server/directory.ts).
const REPO_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/

// Relative subpath within a repo — no leading slash, no ".." segments.
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/

export function isValidRepo(repo: string): boolean {
  return REPO_PATTERN.test(repo)
}

export function isValidInstallPath(path: string): boolean {
  const segments = path.split("/")
  return segments.every(
    (segment) => segment !== ".." && PATH_SEGMENT_PATTERN.test(segment)
  )
}

/** Mirrors src/lib/install-command.ts on the site — kept in sync by hand, it's one line. */
export function getInstallCommand(
  entry: Pick<DirectoryEntry, "repo" | "path">
): string {
  return entry.path
    ? `paseo plugin add ${entry.repo} --path ${entry.path}`
    : `paseo plugin add ${entry.repo}`
}

export function getSiteUrl(entry: Pick<DirectoryEntry, "id">): string {
  return `${SITE_URL}/plugins/${entry.id}`
}

/**
 * installNotesHtml/limitationsNotesHtml are sanitized HTML meant for the
 * site's DOM renderer. This plugin only has React Native Text/View, so
 * rather than pull in an HTML-to-RN renderer just for two README excerpts,
 * this strips tags down to plain text — same words, no rich formatting.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

/** Mirrors the site's HEALTH_LABELS in src/routes/plugins.$id.tsx. */
export const HEALTH_LABELS: Record<string, string> = {
  manifestValid: "Valid paseo-plugin.json manifest",
  hasReadme: "Has a README",
  hasLicense: "Has a license",
  hasTests: "Has tests",
  hasTypecheckScript: "Has a typecheck script",
  updatedRecently: "Updated in the last 6 months",
}
