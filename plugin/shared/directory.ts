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

// The GitHub org that publishes official paseo.cafe plugins. Mirrors
// src/lib/site.ts's OFFICIAL_GITHUB_ORG/isOfficialPlugin — kept as a local
// copy since this package doesn't import from the web app's src/ tree.
export const OFFICIAL_GITHUB_ORG = "paseo-cafe"
export function isOfficialPlugin(entry: {
  owner?: { login?: string }
}): boolean {
  return entry.owner?.login?.toLowerCase() === OFFICIAL_GITHUB_ORG.toLowerCase()
}
const MAX_HTTP_URL_LENGTH = 2_048
const httpUrlSchema = z
  .url()
  .max(MAX_HTTP_URL_LENGTH)
  .refine((value) => /^https?:\/\//i.test(value), "Expected an HTTP(S) URL")

/**
 * Catalog responses decide which repositories the install button hands to the
 * `paseo` CLI, so the transport has to be authenticated: anyone able to rewrite
 * a plaintext response picks what gets installed on the daemon host. HTTP is
 * allowed only for loopback, which is what the local-development workflow in
 * the README needs; every other catalog has to be HTTPS.
 */
const catalogUrlPattern =
  /^(https?):\/\/(?:[^/?#@\s\\]*@)?(\[[0-9a-f:.]+\]|[^:/?#@\s\\]+)(?::(\d+))?(?:[/?#]|$)/i

export function isTrustedCatalogUrl(value: string): boolean {
  try {
    new URL(value)
  } catch {
    return false
  }
  // React Native's URL shim truncates bracketed IPv6 hostnames and preserves
  // host casing. Parse the authority directly instead of trusting its hostname.
  const match = catalogUrlPattern.exec(value.trim())
  if (!match) return false
  const [, protocol, rawHost, port] = match
  if (port !== undefined && Number(port) > 65_535) return false
  if (protocol.toLowerCase() === "https") return true
  const host = rawHost.toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]") {
    return true
  }
  const octets = host.split(".")
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every(
      (octet) => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255
    )
  )
}

const catalogUrlSchema = httpUrlSchema.refine(
  isTrustedCatalogUrl,
  "Catalog URL must use HTTPS, or HTTP on localhost"
)

export const DIRECTORY_CATEGORIES = [
  "automation",
  "browser",
  "code-review",
  "git",
  "github",
  "monitoring",
  "orchestration",
  "productivity",
  "provider",
  "theme",
  "other",
] as const

export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number]

export const DIRECTORY_CATEGORY_LABELS: Record<DirectoryCategory, string> = {
  automation: "Automation",
  browser: "Browser",
  "code-review": "Code Review",
  git: "Git",
  github: "GitHub",
  monitoring: "Monitoring",
  orchestration: "Orchestration",
  productivity: "Productivity",
  provider: "Provider",
  theme: "Theme",
  other: "Other",
}

/** Maps filter input onto the stable directory taxonomy without inventing a match. */
export function normalizeDirectoryCategoryFilter(
  category: string
): DirectoryCategory | "" {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, "-")
  return Object.hasOwn(DIRECTORY_CATEGORY_LABELS, normalized)
    ? (normalized as DirectoryCategory)
    : ""
}

/** Maps catalog-provided categories onto the stable directory taxonomy. */
export function normalizeDirectoryCategory(
  category: string
): DirectoryCategory {
  return normalizeDirectoryCategoryFilter(category) || "other"
}

/** Canonicalizes catalog categories while preserving their stable slug identity. */
export function normalizeDirectoryCategories(
  categories: readonly string[]
): DirectoryCategory[] {
  const present = new Set(categories.map(normalizeDirectoryCategory))
  return DIRECTORY_CATEGORIES.filter((category) => present.has(category))
}
export const DIRECTORY_SORT_MODES = [
  "updates-first",
  "popular",
  "recent",
  "a-z",
] as const

export const DIRECTORY_STATUS_FILTERS = [
  "all",
  "installed",
  "updates",
  "not-installed",
] as const

export const directoryBrowseSettingsSchema = z.object({
  query: z.string().max(200).default(""),
  categories: z.array(z.enum(DIRECTORY_CATEGORIES)).default([]),
  platforms: z.array(z.string()).default([]),
  status: z.enum(DIRECTORY_STATUS_FILTERS).default("all"),
  sort: z.enum(DIRECTORY_SORT_MODES).default("updates-first"),
  lastOpenedPluginId: z.string().nullable().default(null),
})

export type DirectoryBrowseSettings = z.infer<
  typeof directoryBrowseSettingsSchema
>

export const DEFAULT_DIRECTORY_BROWSE_SETTINGS =
  directoryBrowseSettingsSchema.parse({})

function containsSameValues(
  left: readonly string[],
  right: readonly string[]
): boolean {
  const leftValues = new Set(left)
  const rightValues = new Set(right)
  if (leftValues.size !== rightValues.size) return false
  for (const value of leftValues) {
    if (!rightValues.has(value)) return false
  }
  return true
}

/** Compares persisted browse state using set semantics for multi-select filters. */
export function directoryBrowseSettingsEqual(
  left: DirectoryBrowseSettings,
  right: DirectoryBrowseSettings
): boolean {
  return (
    left.query === right.query &&
    containsSameValues(left.categories, right.categories) &&
    containsSameValues(left.platforms, right.platforms) &&
    left.status === right.status &&
    left.sort === right.sort &&
    left.lastOpenedPluginId === right.lastOpenedPluginId
  )
}

export function migrateDirectorySettings(
  values: unknown,
  fromVersion: number
): unknown {
  if (
    fromVersion >= 2 ||
    typeof values !== "object" ||
    values === null ||
    Array.isArray(values)
  ) {
    return values
  }

  const previous = values as Record<string, unknown>
  return {
    ...previous,
    browse: previous.browse ?? DEFAULT_DIRECTORY_BROWSE_SETTINGS,
  }
}

/**
 * The SDK currently supports host-scoped settings only. Browse fields are
 * deliberately limited to visible surface state, so search/filter/detail state
 * survives a restart and is shared by clients connected to the same host.
 */
export const directorySettings = defineSettings({
  id: "directory-settings",
  scope: "host",
  version: 2,
  schema: z.object({
    directoryUrl: catalogUrlSchema.default(DEFAULT_DIRECTORY_URL),
    browse: directoryBrowseSettingsSchema.default(
      DEFAULT_DIRECTORY_BROWSE_SETTINGS
    ),
  }),
  migrate: migrateDirectorySettings,
})

const MAX_MANIFEST_DEPTH = 16
const MAX_MANIFEST_SERIALIZED_BYTES = 64 * 1_024
const MAX_MANIFEST_NODES = 2_048
const MAX_MANIFEST_CONTAINER_ITEMS = 128
const MAX_MANIFEST_KEY_LENGTH = 128
const MAX_MANIFEST_STRING_LENGTH = 16_384

function isJsonObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function jsonStringBytes(value: string): number {
  let bytes = 2 // Surrounding JSON quotation marks.
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit === 0x22 || codeUnit === 0x5c) {
      bytes += 2
    } else if (codeUnit <= 0x1f) {
      bytes +=
        codeUnit === 0x08 ||
        codeUnit === 0x09 ||
        codeUnit === 0x0a ||
        codeUnit === 0x0c ||
        codeUnit === 0x0d
          ? 2
          : 6
    } else if (codeUnit <= 0x7f) {
      bytes += 1
    } else if (codeUnit <= 0x7ff) {
      bytes += 2
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 6
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      bytes += 6
    } else {
      bytes += 3
    }
  }
  return bytes
}

const directoryManifestSchema = z
  .custom<Record<string, unknown>>(
    isJsonObject,
    "Manifest must be a JSON object"
  )
  .superRefine((manifest, context) => {
    const stack: Array<{ value: unknown; depth: number }> = [
      { value: manifest, depth: 1 },
    ]
    const seen = new WeakSet<object>()
    let nodes = 0
    let serializedBytes = 0

    const reject = (message: string) => {
      context.addIssue({ code: "custom", message })
    }

    while (stack.length > 0) {
      const current = stack.pop()
      if (!current) break
      const { value, depth } = current
      nodes += 1
      if (nodes > MAX_MANIFEST_NODES) {
        reject(`Manifest exceeds ${MAX_MANIFEST_NODES} JSON values`)
        return
      }
      if (depth > MAX_MANIFEST_DEPTH) {
        reject(`Manifest exceeds maximum depth ${MAX_MANIFEST_DEPTH}`)
        return
      }

      if (value === null) {
        serializedBytes += 4
      } else if (typeof value === "string") {
        if (value.length > MAX_MANIFEST_STRING_LENGTH) {
          reject(
            `Manifest string exceeds ${MAX_MANIFEST_STRING_LENGTH} characters`
          )
          return
        }
        serializedBytes += jsonStringBytes(value)
      } else if (typeof value === "number") {
        if (!Number.isFinite(value)) {
          reject("Manifest contains a non-finite number")
          return
        }
        serializedBytes += String(value).length
      } else if (typeof value === "boolean") {
        serializedBytes += value ? 4 : 5
      } else if (Array.isArray(value)) {
        if (seen.has(value)) {
          reject("Manifest contains a circular or repeated object reference")
          return
        }
        seen.add(value)
        if (value.length > MAX_MANIFEST_CONTAINER_ITEMS) {
          reject(`Manifest array exceeds ${MAX_MANIFEST_CONTAINER_ITEMS} items`)
          return
        }
        serializedBytes += 2 + Math.max(0, value.length - 1)
        for (let index = value.length - 1; index >= 0; index -= 1) {
          stack.push({ value: value[index], depth: depth + 1 })
        }
      } else if (isJsonObject(value)) {
        if (seen.has(value)) {
          reject("Manifest contains a circular or repeated object reference")
          return
        }
        seen.add(value)
        const keys = Object.keys(value)
        if (keys.length > MAX_MANIFEST_CONTAINER_ITEMS) {
          reject(
            `Manifest object exceeds ${MAX_MANIFEST_CONTAINER_ITEMS} fields`
          )
          return
        }
        serializedBytes += 2 + Math.max(0, keys.length - 1)
        for (let index = keys.length - 1; index >= 0; index -= 1) {
          const key = keys[index]
          if (key === undefined) continue
          if (key.length > MAX_MANIFEST_KEY_LENGTH) {
            reject(`Manifest key exceeds ${MAX_MANIFEST_KEY_LENGTH} characters`)
            return
          }
          serializedBytes += jsonStringBytes(key) + 1
          stack.push({ value: value[key], depth: depth + 1 })
        }
      } else {
        reject("Manifest contains a non-JSON value")
        return
      }

      if (serializedBytes > MAX_MANIFEST_SERIALIZED_BYTES) {
        reject(
          `Manifest exceeds ${MAX_MANIFEST_SERIALIZED_BYTES} serialized bytes`
        )
        return
      }
    }
  })

/**
 * Trimmed mirror of the PluginRecord shape served by https://paseo.cafe/api/plugins
 * (see src/lib/plugin-schema.ts and src/routes/api.plugins.ts in the site). Keep
 * JSON-compatible manifest data so the client can render it without re-fetching
 * or re-parsing the catalog payload.
 */
export const directoryEntrySchema = z.object({
  id: z.string().max(200),
  repo: z.string().max(200),
  path: z.string().max(500).optional(),
  url: httpUrlSchema,
  name: z.string().max(200),
  description: z.string().max(4_000).default(""),
  author: z.string().max(200).optional(),
  categories: z.array(z.string().max(100)).max(32).default([]),
  platforms: z.array(z.string().max(100)).max(32).default([]),
  caveats: z.array(z.string().max(1_000)).max(64).default([]),
  license: z.string().max(100).optional(),
  // e.g. ">=0.8.0" — the plugin's own `requirements.paseo` from its
  // paseo-plugin.json (see scripts/scan.ts on the site). Highlighted the
  // same way as a platform restriction, not left for someone to dig out of
  // the README or the manifest themselves.
  paseoVersionRequirement: z.string().max(200).optional(),
  manifest: directoryManifestSchema.optional(),
  images: z.array(httpUrlSchema).max(32).default([]),
  // Raw README markdown from the scanner. Keep it optional so older catalog
  // payloads still parse, and bound it so the companion plugin never retains
  // or renders an unbounded blob.
  readmeText: z.string().max(200_000).optional(),
  // Pre-sanitized HTML rendered at scan time from the plugin's own README
  // (see src/lib/markdown.ts on the site) — this plugin has no HTML renderer,
  // so it's shown as stripped plain text (see stripHtml below) rather than
  // with the site's original formatting.
  installNotesHtml: z.string().max(100_000).optional(),
  limitationsNotesHtml: z.string().max(100_000).optional(),
  scanError: z.string().max(4_000).optional(),
  scannedAt: z.string().max(100).optional(),
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
  // Mirrors src/lib/plugin-schema.ts's pluginSecuritySchema invariants — a
  // remote catalog is untrusted input, so the consumer must enforce at
  // least as much as the producer: a non-"unknown" verdict must carry a
  // real commit SHA, and "passed" cannot coexist with blocking findings.
  // Without this, a hostile/compromised catalog could fabricate a green
  // "Passed" badge directly above the install action.
  security: z
    .object({
      status: z.enum(["passed", "failed", "unknown"]),
      blockingFindings: z.number().int().nonnegative().max(1_000_000),
      advisoryFindings: z.number().int().nonnegative().max(1_000_000),
      scannedAt: z.string().max(100).optional(),
      commit: z
        .string()
        .trim()
        .regex(/^[0-9a-f]{40}$/i, "Must be a full Git commit SHA")
        .transform((commit) => commit.toLowerCase())
        .optional(),
      reportUrl: httpUrlSchema.optional(),
    })
    .optional()
    .superRefine((security, ctx) => {
      if (!security) return
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
    }),
  owner: z
    .object({
      login: z.string().max(100).optional(),
      avatarUrl: httpUrlSchema.optional(),
    })
    .optional(),
  repoMeta: z
    .object({
      stars: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
      pushedAt: z.string().max(100).optional(),
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
  input: z.object({ baseUrl: catalogUrlSchema.optional() }),
  output: z.object({
    installations: z.array(installedPluginSchema).max(500),
  }),
})

const directoryAttachmentSearchInput = z.object({
  query: z.string().max(200),
})

export const directorySearchRpc = defineRpc({
  name: "directory.search",
  input: directoryAttachmentSearchInput,
  output: PluginAttachmentSearchPayloadSchema,
})

export const directoryManifestSearchRpc = defineRpc({
  name: "directory.search-manifests",
  input: directoryAttachmentSearchInput,
  output: PluginAttachmentSearchPayloadSchema,
})

export const directoryReadmeSearchRpc = defineRpc({
  name: "directory.search-readmes",
  input: directoryAttachmentSearchInput,
  output: PluginAttachmentSearchPayloadSchema,
})

export const directorySecuritySearchRpc = defineRpc({
  name: "directory.search-security",
  input: directoryAttachmentSearchInput,
  output: PluginAttachmentSearchPayloadSchema,
})

/**
 * Attachment searches always read the default catalog: Paseo calls the search
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

export const directoryManifestAttachments = defineAttachmentSource({
  id: "paseo-plugin-manifests",
  title: "Paseo plugin manifest",
  icon: "FileJson",
  pickerTitle: "Attach Paseo plugin manifest",
  searchPlaceholder: "Search plugins by name, repository, or category",
  search: directoryManifestSearchRpc,
})

export const directoryReadmeAttachments = defineAttachmentSource({
  id: "paseo-plugin-readmes",
  title: "Paseo plugin README",
  icon: "FileText",
  pickerTitle: "Attach Paseo plugin README",
  searchPlaceholder: "Search plugins by name, repository, or category",
  search: directoryReadmeSearchRpc,
})

export const directorySecurityAttachments = defineAttachmentSource({
  id: "paseo-plugin-security",
  title: "Paseo plugin security",
  icon: "ShieldCheck",
  pickerTitle: "Attach Paseo plugin security summary",
  searchPlaceholder: "Search plugins by name, repository, or category",
  search: directorySecuritySearchRpc,
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

const GITHUB_NEW_ISSUE_URL =
  "https://github.com/paseo-cafe/paseo-cafe/issues/new"

export function getReportPluginIssueUrl(
  entry: Pick<DirectoryEntry, "id" | "url">
): string {
  const url = new URL(GITHUB_NEW_ISSUE_URL)
  url.searchParams.set("title", `Report plugin: ${entry.id}`)
  url.searchParams.set(
    "body",
    [
      "## Problem",
      "Describe the problem you saw, what you expected, and how to reproduce it.",
      "",
      `- Plugin ID: \`${entry.id}\``,
      `- Source repository: ${entry.url}`,
      `- Paseo listing: ${getSiteUrl(entry)}`,
      "",
      "## Additional context",
      "",
    ].join("\n")
  )
  return url.toString()
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
