import {
  defineAttachmentSource,
  defineRpc,
  defineSettings,
  PluginAttachmentSearchPayloadSchema,
} from "@getpaseo/plugin"
import { z } from "zod"

export const DEFAULT_DIRECTORY_URL = "https://paseo.cafe/api/plugins"

// Always the real site, independent of directorySettings.directoryUrl above —
// "View on paseo.cafe" should never point at a local/staging override.
const SITE_URL = "https://paseo.cafe"
const httpUrlSchema = z
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "Expected an HTTP(S) URL")

/**
 * Catalog responses decide which repositories the install button hands to the
 * `paseo` CLI, so the transport has to be authenticated: anyone able to rewrite
 * a plaintext response picks what gets installed on the daemon host. HTTP is
 * allowed only for loopback, which is what the local-development workflow in
 * the README needs; every other catalog has to be HTTPS.
 */
export function isTrustedCatalogUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol === "https:") return true
  if (url.protocol !== "http:") return false
  const host = url.hostname
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  )
}

const catalogUrlSchema = httpUrlSchema.refine(
  isTrustedCatalogUrl,
  "Catalog URL must use HTTPS, or HTTP on localhost"
)

/**
 * Which paseo.cafe deployment to read from — host-scoped so it's one setting
 * per daemon, editable from Settings → Plugins → Paseo Cafe without a
 * reload. Exists for local development (point at `bun run dev`) and for
 * anyone running a self-hosted fork of the directory.
 */
export const directorySettings = defineSettings({
  id: "directory-settings",
  scope: "host",
  version: 1,
  schema: z.object({
    directoryUrl: catalogUrlSchema.default(DEFAULT_DIRECTORY_URL),
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
  url: httpUrlSchema,
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
  images: z.array(httpUrlSchema).default([]),
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
      avatarUrl: httpUrlSchema.optional(),
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

export const installedPluginSchema = z.object({
  id: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  status: z.enum(["running", "failed", "disabled"]),
  source: z.enum(["git", "directory"]).default("directory"),
  remote: z.string().optional(),
  ref: z.string().optional(),
  commit: z.string().optional(),
  latestCommit: z.string().optional(),
  updateState: z
    .enum(["unknown", "pinned", "current", "available", "diverged"])
    .default("unknown"),
  updateError: z.string().optional(),
})

export type InstalledPlugin = z.infer<typeof installedPluginSchema>

export const directoryListRpc = defineRpc({
  name: "directory.list",
  // baseUrl comes from the client's own directorySettings read — see
  // DirectorySurface.tsx — so the server doesn't need its own settings access.
  input: z.object({
    baseUrl: catalogUrlSchema.optional(),
    force: z.boolean().default(false),
  }),
  output: z.object({
    plugins: z.array(directoryEntrySchema).max(500),
    fetchedAt: z.iso.datetime({ offset: true, local: true }),
    installations: z.array(installedPluginSchema).max(500).optional(),
    installationError: z.string().optional(),
  }),
})

export const directoryUpdateStatusRpc = defineRpc({
  name: "directory.update-status",
  input: z.object({ baseUrl: httpUrlSchema.optional() }),
  output: z.object({
    installations: z.array(installedPluginSchema).max(500),
  }),
})

export const directorySearchRpc = defineRpc({
  name: "directory.search",
  input: z.object({ query: z.string().max(200) }),
  output: PluginAttachmentSearchPayloadSchema,
})

/**
 * Attachment search always reads the default catalog: Paseo calls the search
 * contract with `{ query }` only, and a server handler cannot read its own
 * settings document (PluginServerContext exposes registerSettings/handle/
 * registerProvider, and its context is just `paseo`). A host that overrides
 * directoryUrl therefore still gets paseo.cafe results in the composer.
 */
export const directoryAttachments = defineAttachmentSource({
  id: "paseo-plugins",
  title: "Paseo plugin",
  icon: "Blocks",
  pickerTitle: "Attach Paseo plugin",
  searchPlaceholder: "Search plugins by name, repository, or category",
  search: directorySearchRpc,
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

export const directoryUpdateRpc = defineRpc({
  name: "directory.update",
  input: z.object({
    pluginId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    entry: z.object({
      id: z.string(),
      repo: z.string(),
      path: z.string().optional(),
    }),
  }),
  output: z.object({
    ok: z.boolean(),
    message: z.string(),
    updated: z.boolean().optional(),
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
  return `${SITE_URL}/plugins/${encodeURIComponent(entry.id)}`
}
function githubRepoFromRemote(remote: string | undefined): string | undefined {
  if (!remote) return undefined
  const normalized = remote
    .trim()
    .replace(/\/$/, "")
    .replace(/\.git$/, "")
  const match =
    /^(?:(?:https?|git):\/\/|ssh:\/\/(?:git@)?|git@)github\.com[/:]([^/]+)\/([^/]+)$/i.exec(
      normalized
    )
  return match ? `${match[1]}/${match[2]}`.toLowerCase() : undefined
}
function normalizePluginPath(path: string | undefined): string | undefined {
  if (!path || path === ".") return undefined
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/$/, "")
  return normalized || undefined
}

function pluginPathFromCheckout(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/").replace(/\/$/, "")
  const marker = "/checkout"
  const index = normalized.lastIndexOf(marker)
  if (index < 0) return undefined
  return normalizePluginPath(normalized.slice(index + marker.length))
}

export function findInstallations(
  entry: Pick<DirectoryEntry, "id" | "repo" | "path">,
  installations: readonly InstalledPlugin[]
): InstalledPlugin[] {
  const expectedRepo = entry.repo.toLowerCase()
  const expectedPath = normalizePluginPath(entry.path)
  return installations.filter((installation) => {
    if (installation.source === "directory") return installation.id === entry.id
    return (
      githubRepoFromRemote(installation.remote) === expectedRepo &&
      pluginPathFromCheckout(installation.path) === expectedPath
    )
  })
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
    .replace(/<\/[^>]+>(?=[.,!?;:])/g, "")
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
