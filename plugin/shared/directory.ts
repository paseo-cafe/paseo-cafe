import {
  defineAttachmentSource,
  defineRpc,
  defineSettings,
  PluginAttachmentSearchPayloadSchema,
} from "@getpaseo/plugin"
import { z } from "zod"
import {
  CATALOG_ADDED_AT_LABEL,
  CATALOG_CATEGORIES,
  CATALOG_CATEGORY_LABELS,
  CATALOG_HEALTH_KEYS,
  CATALOG_HEALTH_LABELS,
  CATALOG_PLATFORM_LABELS,
  CATALOG_THEME_APPEARANCES,
  CATALOG_THEME_MAX_PER_PLUGIN,
  CATALOG_VERSION_MAX_LENGTH,
  type CatalogCategory,
  type CatalogHealthCheck,
  compareCatalogAddedAt,
  compareCatalogPopularity,
  compareCatalogRecency,
  compareCatalogSource,
  formatCatalogCompactCount,
  formatCatalogDateForReader,
  formatCatalogDownloads,
  formatCatalogVersion,
  getCatalogAddedDateBadge,
  getCatalogInstallCommand,
  getCatalogInstallRef,
  getCatalogNpmInstallCommand,
  getCatalogNpmInstallCommandForChannel,
  getCatalogPublishedDateBadge,
  getCatalogRepositoryOwner,
  getCatalogRepositoryUrl,
  hasCompleteCatalogNpmMetrics,
  isCatalogAddedAtKnown,
  isCatalogRecencyKnown,
  isOfficialCatalogPlugin,
  isValidCatalogCommit,
  isValidCatalogPackage,
  isValidCatalogPath,
  isValidCatalogRef,
  isValidCatalogRepository,
  isValidCatalogThemeColor,
  isValidCatalogVersion,
  normalizeCatalogCategories,
  normalizeCatalogCategory,
  normalizeCatalogCategoryFilter,
} from "./catalog"
import {
  hasVisibleInlineText,
  type InlineMarkdownNode,
  inlineMarkdownFromPlainText,
  safeInlineHref,
} from "./inline-markdown"

export const DEFAULT_DIRECTORY_URL = "https://paseo.cafe/api/plugins"

// Always the real site, independent of directorySettings.directoryUrl above —
// "View on paseo.cafe" should never point at a local/staging override.
const SITE_URL = "https://paseo.cafe"

export const isOfficialPlugin = isOfficialCatalogPlugin
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

export const DIRECTORY_PLATFORM_LABELS = CATALOG_PLATFORM_LABELS
export const formatDirectoryVersion = formatCatalogVersion
const catalogUrlSchema = httpUrlSchema.refine(
  isTrustedCatalogUrl,
  "Catalog URL must use HTTPS, or HTTP on localhost"
)
const themeHexColorSchema = z.string().refine(isValidCatalogThemeColor)
const directoryThemePreviewSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  appearance: z.enum(CATALOG_THEME_APPEARANCES),
  colors: z.object({
    background: themeHexColorSchema,
    foreground: themeHexColorSchema,
    raised: themeHexColorSchema,
    control: themeHexColorSchema,
    border: themeHexColorSchema,
    accent: themeHexColorSchema.optional(),
    mutedForeground: themeHexColorSchema,
    ring: themeHexColorSchema,
  }),
})

export const DIRECTORY_CATEGORIES = CATALOG_CATEGORIES

export type DirectoryCategory = CatalogCategory

export const DIRECTORY_CATEGORY_LABELS = CATALOG_CATEGORY_LABELS

/** Maps filter input onto the stable directory taxonomy without inventing a match. */
export const normalizeDirectoryCategoryFilter = normalizeCatalogCategoryFilter

/** Maps catalog-provided categories onto the stable directory taxonomy. */
export const normalizeDirectoryCategory = normalizeCatalogCategory

/** Canonicalizes catalog categories while preserving their stable slug identity. */
export const normalizeDirectoryCategories = normalizeCatalogCategories
export const DIRECTORY_SORT_MODES = [
  "updates-first",
  "popular",
  "recently-added",
  "a-z",
] as const

/** Shared source-aware recency sorting with the website — see ./catalog.ts. */
export const DIRECTORY_ADDED_AT_LABEL = CATALOG_ADDED_AT_LABEL
export const compareDirectoryAddedAt = compareCatalogAddedAt
export const compareDirectoryPopularity = compareCatalogPopularity
export const compareDirectoryRecency = compareCatalogRecency
export const compareDirectorySource = compareCatalogSource
export const isDirectoryAddedAtKnown = isCatalogAddedAtKnown
export const isDirectoryRecencyKnown = isCatalogRecencyKnown
export const getDirectoryAddedDateBadge = getCatalogAddedDateBadge
export const getDirectoryPublishedDateBadge = getCatalogPublishedDateBadge
export const formatDirectoryDate = formatCatalogDateForReader
export const formatDirectoryCompactCount = formatCatalogCompactCount
export const formatDirectoryDownloads = formatCatalogDownloads

export const hasCompleteDirectoryNpmMetrics = hasCompleteCatalogNpmMetrics
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

/**
 * Whether the surface is showing its default, unfiltered view — the only
 * state where the curated highlight sections belong. The sort is part of
 * that: the highlights are the one part of the surface that does *not*
 * reorder, so leaving them in place after someone picks a different sort
 * reads as the sort having done nothing. Mirrors the website's `showFeatured`
 * rule in src/routes/index.tsx; keep the two in step.
 */
export function isDefaultDirectoryBrowseView(
  browse: Pick<
    DirectoryBrowseSettings,
    "query" | "categories" | "platforms" | "status" | "sort"
  >
): boolean {
  return (
    browse.query.trim() === "" &&
    browse.categories.length === 0 &&
    browse.platforms.length === 0 &&
    browse.status === DEFAULT_DIRECTORY_BROWSE_SETTINGS.status &&
    browse.sort === DEFAULT_DIRECTORY_BROWSE_SETTINGS.sort
  )
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
    fromVersion >= 4 ||
    typeof values !== "object" ||
    values === null ||
    Array.isArray(values)
  ) {
    return values
  }

  const previous = values as Record<string, unknown>
  const browse =
    previous.browse &&
    typeof previous.browse === "object" &&
    !Array.isArray(previous.browse)
      ? (previous.browse as Record<string, unknown>)
      : DEFAULT_DIRECTORY_BROWSE_SETTINGS
  return {
    ...previous,
    browse: {
      ...browse,
      ...(browse.sort === "recent" ? { sort: "updates-first" } : {}),
    },
  }
}

/**
 * Settings are host-scoped so catalog selection, browse state, and explicit
 * per-installation Preview subscriptions survive restarts across clients.
 */
export const directorySettings = defineSettings({
  id: "directory-settings",
  scope: "host",
  version: 4,
  schema: z.object({
    directoryUrl: catalogUrlSchema.default(DEFAULT_DIRECTORY_URL),
    browse: directoryBrowseSettingsSchema.default(
      DEFAULT_DIRECTORY_BROWSE_SETTINGS
    ),
    previewOptIns: z
      .array(z.string().regex(/^[a-z][a-z0-9-]*$/))
      .max(500)
      .default([]),
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

export const MAX_DIRECTORY_INLINE_LINK_NODES = 512
export const MAX_DIRECTORY_INLINE_TEXT_NODES = 4_096
export const MAX_DIRECTORY_INLINE_TEXT_CHARACTERS = 68_000
export const MAX_DIRECTORY_INLINE_HREF_CHARACTERS = 32_000

/**
 * plugin/shared/inline-markdown.ts's model, as the API hands it over. Text
 * and href lengths follow the raw fields they render; a node count bound
 * keeps a hostile catalog from handing the renderer thousands of Texts.
 */
const inlineMarkdownTextNodeSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(4_000),
  code: z.boolean().optional(),
  strong: z.boolean().optional(),
  emphasis: z.boolean().optional(),
})
const inlineMarkdownNodeSchema = z.discriminatedUnion("type", [
  inlineMarkdownTextNodeSchema,
  z.object({
    type: z.literal("link"),
    href: z
      .string()
      .max(2_048)
      .refine(
        (value) => safeInlineHref(value) !== undefined,
        "Expected a safe absolute inline link"
      ),
    children: z
      .array(inlineMarkdownTextNodeSchema)
      .max(1_000)
      .refine(
        (children) =>
          children.some((child) => hasVisibleInlineText(child.text)),
        "Expected a visible inline link label"
      ),
  }),
])

type DirectoryInlineMarkdownNode = z.infer<typeof inlineMarkdownNodeSchema>

function measureInlineMarkdown(
  groups: readonly (readonly DirectoryInlineMarkdownNode[])[]
): {
  linkNodes: number
  textNodes: number
  textCharacters: number
  hrefCharacters: number
} {
  let linkNodes = 0
  let textNodes = 0
  let textCharacters = 0
  let hrefCharacters = 0

  for (const nodes of groups) {
    for (const node of nodes) {
      if (node.type === "text") {
        textNodes += 1
        textCharacters += node.text.length
        continue
      }

      linkNodes += 1
      hrefCharacters += node.href.length
      for (const child of node.children) {
        textNodes += 1
        textCharacters += child.text.length
      }
    }
  }

  return { linkNodes, textNodes, textCharacters, hrefCharacters }
}

const directoryHealthShape = {
  manifestValid: z.boolean().optional(),
  hasReadme: z.boolean().optional(),
  hasLicense: z.boolean().optional(),
  hasTests: z.boolean().optional(),
  hasTypecheckScript: z.boolean().optional(),
  updatedRecently: z.boolean().optional(),
} satisfies Record<CatalogHealthCheck, z.ZodType<boolean | undefined>>

/**
 * Trimmed mirror of the PluginRecord shape served by https://paseo.cafe/api/plugins
 * (see src/lib/directory-api.ts in the site). Keep JSON-compatible manifest
 * data so the client can render it without re-fetching or re-parsing the
 * catalog payload.
 */
export const directoryEntrySchema = z
  .object({
    id: z.string().max(200),
    repo: z
      .string()
      .max(200)
      .refine(isValidCatalogRepository, "Expected a GitHub owner/repository"),
    path: z
      .string()
      .max(500)
      .refine(isValidCatalogPath, "Expected a safe repository subpath")
      .optional(),
    package: z
      .string()
      .max(214)
      .refine(isValidCatalogPackage, "Expected a valid npm package name")
      .optional(),
    npm: z
      .object({
        package: z.string().max(214),
        version: z
          .string()
          .max(CATALOG_VERSION_MAX_LENGTH)
          .refine(isValidCatalogVersion, "Expected a semantic version"),
        integrity: z.string().startsWith("sha512-"),
        publishedAt: z.iso.datetime({ offset: true }).optional(),
        downloadsLast30Days: z.number().int().nonnegative().optional(),
      })
      .optional(),
    npmPreview: z
      .object({
        package: z.string().max(214).refine(isValidCatalogPackage),
        version: z
          .string()
          .max(CATALOG_VERSION_MAX_LENGTH)
          .refine(isValidCatalogVersion),
        integrity: z.string().startsWith("sha512-"),
        distTag: z.literal("next"),
        publishedAt: z.iso.datetime({ offset: true }),
      })
      .optional(),
    url: httpUrlSchema,
    name: z.string().max(200),
    description: z.string().max(4_000).default(""),
    // The rendered form of `description`. Optional because a catalog that
    // predates it (an older deployment, a staging build) only has the string.
    descriptionNodes: z.array(inlineMarkdownNodeSchema).max(4_000).optional(),
    // Normalized package.json semver from the catalog scanner. Optional so an
    // older catalog or a plugin without a valid version still remains browsable.
    version: z
      .string()
      .max(CATALOG_VERSION_MAX_LENGTH)
      .refine(isValidCatalogVersion, "Expected a semantic version")
      .optional(),
    author: z.string().max(200).optional(),
    categories: z.array(z.string().max(100)).max(32).default([]),
    platforms: z.array(z.string().max(100)).max(32).default([]),
    caveats: z.array(z.string().max(1_000)).max(64).default([]),
    caveatNodes: z
      .array(z.array(inlineMarkdownNodeSchema).max(1_000))
      .max(64)
      .optional(),
    license: z.string().max(100).optional(),
    // e.g. ">=0.8.0" — the plugin's own `requirements.paseo` from its
    // paseo-plugin.json (see scripts/scan.ts on the site). Highlighted the
    // same way as a platform restriction, not left for someone to dig out of
    // the README or the manifest themselves.
    paseoVersionRequirement: z.string().max(200).optional(),
    manifest: directoryManifestSchema.optional(),
    images: z.array(httpUrlSchema).max(32).default([]),
    themes: z
      .array(directoryThemePreviewSchema)
      .max(CATALOG_THEME_MAX_PER_PLUGIN)
      .default([]),
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
    // When the catalog listed this Git-only plugin (see PluginRecord.addedAt).
    // npm-backed entries use npm.publishedAt instead. Kept as a plain bounded
    // string so malformed dates lose ranking priority rather than dropping the
    // whole entry.
    addedAt: z.string().max(100).optional(),
    scannedAt: z.string().max(100).optional(),
    health: z.object(directoryHealthShape).optional(),
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
    npmSecurity: z
      .object({
        status: z.enum(["passed", "failed", "unknown"]),
        blockingFindings: z.number().int().nonnegative().max(1_000_000),
        advisoryFindings: z.number().int().nonnegative().max(1_000_000),
        scannedAt: z.string().max(100).optional(),
        version: z.string().max(CATALOG_VERSION_MAX_LENGTH).optional(),
        integrity: z.string().startsWith("sha512-").optional(),
      })
      .optional()
      .superRefine((security, ctx) => {
        if (security?.status === "passed" && security.blockingFindings > 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["blockingFindings"],
            message: 'status "passed" cannot have blocking findings',
          })
        }
      }),
    npmPreviewSecurity: z
      .object({
        status: z.enum(["passed", "failed", "unknown"]),
        blockingFindings: z.number().int().nonnegative().max(1_000_000),
        advisoryFindings: z.number().int().nonnegative().max(1_000_000),
        scannedAt: z.string().max(100).optional(),
        version: z.string().max(CATALOG_VERSION_MAX_LENGTH).optional(),
        integrity: z.string().startsWith("sha512-").optional(),
      })
      .optional()
      .superRefine((security, ctx) => {
        if (security?.status === "passed" && security.blockingFindings > 0) {
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
        defaultBranch: z.string().max(255).optional(),
        pushedAt: z.string().max(100).optional(),
      })
      .optional(),
  })
  .superRefine((entry, ctx) => {
    if (
      entry.caveatNodes !== undefined &&
      entry.caveatNodes.length !== entry.caveats.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["caveatNodes"],
        message: "Rendered caveats must align with raw caveats",
      })
    }

    const inlineMarkdown = measureInlineMarkdown([
      entry.descriptionNodes ?? [],
      ...(entry.caveatNodes ?? []),
    ])
    const limits = [
      {
        count: inlineMarkdown.linkNodes,
        maximum: MAX_DIRECTORY_INLINE_LINK_NODES,
        label: "link nodes",
      },
      {
        count: inlineMarkdown.textNodes,
        maximum: MAX_DIRECTORY_INLINE_TEXT_NODES,
        label: "text nodes",
      },
      {
        count: inlineMarkdown.textCharacters,
        maximum: MAX_DIRECTORY_INLINE_TEXT_CHARACTERS,
        label: "text characters",
      },
      {
        count: inlineMarkdown.hrefCharacters,
        maximum: MAX_DIRECTORY_INLINE_HREF_CHARACTERS,
        label: "link destination characters",
      },
    ]
    for (const { count, maximum, label } of limits) {
      if (count <= maximum) continue
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["descriptionNodes"],
        message: `Inline markdown exceeds ${maximum} ${label}`,
      })
    }
    if (entry.npm && !entry.package) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["npm"],
        message: "npm metadata requires a matching package source",
      })
    }
    if (!entry.package) return
    if (
      !entry.version ||
      !entry.npm ||
      entry.npm.package !== entry.package ||
      entry.npm.version !== entry.version ||
      !entry.npmSecurity ||
      entry.npmSecurity.status !== "passed" ||
      entry.npmSecurity.version !== entry.version ||
      entry.npmSecurity.integrity !== entry.npm.integrity
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["package"],
        message:
          "npm source requires matching version, integrity, and passed security scan",
      })
    }
    if (entry.npmPreview || entry.npmPreviewSecurity) {
      if (
        !entry.npmPreview ||
        !entry.npmPreviewSecurity ||
        entry.npmPreview.package !== entry.package ||
        !entry.npm ||
        entry.npmPreview.version === entry.npm.version ||
        entry.npmPreviewSecurity.status !== "passed" ||
        entry.npmPreviewSecurity.version !== entry.npmPreview.version ||
        entry.npmPreviewSecurity.integrity !== entry.npmPreview.integrity
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["npmPreview"],
          message:
            "preview source requires a distinct npm release with matching passed security metadata",
        })
      }
    }
  })

export type DirectoryEntry = z.infer<typeof directoryEntrySchema>

/** What to render for the description: the model, or the string verbatim. */
export function directoryDescriptionNodes(
  entry: Pick<DirectoryEntry, "description" | "descriptionNodes">
): InlineMarkdownNode[] {
  return (
    entry.descriptionNodes ?? inlineMarkdownFromPlainText(entry.description)
  )
}

/** What to render for `caveats[index]`, falling back per caveat. */
export function directoryCaveatNodes(
  entry: Pick<DirectoryEntry, "caveats" | "caveatNodes">,
  index: number
): InlineMarkdownNode[] {
  return (
    entry.caveatNodes?.[index] ??
    inlineMarkdownFromPlainText(entry.caveats[index] ?? "")
  )
}
/** Bounds theme cards rendered outside the virtualized directory list. */
export function getDirectoryThemeHighlights(
  entries: readonly DirectoryEntry[],
  limit: number
): Array<{
  entry: DirectoryEntry
  preview: DirectoryEntry["themes"][number]
}> {
  if (limit <= 0) return []
  return entries
    .flatMap((entry) => entry.themes.map((preview) => ({ entry, preview })))
    .slice(0, limit)
}

export const installedPluginSchema = z.object({
  id: z.string(),
  path: z.string(),
  enabled: z.boolean(),
  status: z.enum(["running", "failed", "disabled"]),
  source: z.enum(["git", "directory", "npm"]).default("directory"),
  remote: z.string().optional(),
  ref: z.string().optional(),
  commit: z.string().optional(),
  pluginPath: z.string().optional(),
  releaseChannel: z.enum(["stable", "preview"]).optional(),
  packageName: z.string().optional(),
  management: z.enum(["legacy", "reviewed"]).default("legacy"),
  version: z.string().max(CATALOG_VERSION_MAX_LENGTH).optional(),
  latestCommit: z.string().optional(),
  updateState: z
    .enum(["unknown", "pinned", "current", "available", "diverged"])
    .default("unknown"),
  updateError: z.string().optional(),
})

export type InstalledPlugin = z.infer<typeof installedPluginSchema>
export function getInstallationStateLabel(
  installation: InstalledPlugin
): string {
  if (installation.source === "directory") return "Installed locally"
  if (installation.updateState === "available") {
    return installation.source === "npm"
      ? "Update available from npm"
      : "Update available"
  }
  if (installation.source === "npm") return "Installed from npm"
  if (installation.updateState === "current") return "Up to date"
  if (installation.updateState === "pinned") return "Pinned"
  if (installation.updateState === "diverged") return "Source diverged"
  return "Update status unavailable"
}

export function getUpdateReviewDetails(
  installation: InstalledPlugin,
  entry: Pick<DirectoryEntry, "version">
): { identity: string; revision: string; review: string } {
  if (installation.source === "npm") {
    const packageName = installation.packageName ?? "npm package"
    const current = installation.version ?? "unknown"
    const target = entry.version ?? "unknown"
    return {
      identity: `npm:${packageName}`,
      revision: `${current} → ${target}`,
      review: `Review npm package ${packageName}@${target} before updating.`,
    }
  }
  const current = installation.commit?.slice(0, 12) ?? "unknown"
  const target = installation.latestCommit?.slice(0, 12) ?? "unknown"
  return {
    identity: `${installation.remote ?? installation.path}${installation.ref ? ` · ${installation.ref}` : ""}`,
    revision: `${current} → ${target}`,
    review: `Review commit ${target} before updating.`,
  }
}

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
    npmSupported: z.boolean().default(false),
    installations: z.array(installedPluginSchema).max(500).optional(),
    installationError: z.string().optional(),
  }),
})

export const directoryUpdateStatusRpc = defineRpc({
  name: "directory.update-status",
  input: z.object({
    baseUrl: catalogUrlSchema.optional(),
    previewOptIns: z
      .array(z.string().regex(/^[a-z][a-z0-9-]*$/))
      .max(500)
      .default([]),
  }),
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
 * Attachment searches remain host-scoped. Paseo 0.9 lets the server read the
 * registered settings document; Paseo 0.8 handlers pass no override and retain
 * the production/environment fallback.
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
    entryId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    channel: z.enum(["stable", "preview"]).default("stable"),
    expectedRepo: z.string().refine(isValidCatalogRepository),
    expectedPath: z.string().max(500).refine(isValidCatalogPath).optional(),
    expectedPackage: z
      .string()
      .max(214)
      .refine(isValidCatalogPackage)
      .optional(),
    expectedVersion: z
      .string()
      .max(CATALOG_VERSION_MAX_LENGTH)
      .refine(isValidCatalogVersion)
      .optional(),
    expectedIntegrity: z.string().startsWith("sha512-").optional(),
    expectedCommit: z
      .string()
      .regex(/^[0-9a-f]{40}$/i)
      .optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    message: z.string(),
  }),
})

export const directoryUpdateRpc = defineRpc({
  name: "directory.update",
  input: z.object({
    entryId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    installationId: z.string().regex(/^[a-z][a-z0-9-]*$/),
    channel: z.enum(["stable", "preview"]).default("stable"),
    expectedRepo: z.string().refine(isValidCatalogRepository),
    expectedPath: z.string().max(500).refine(isValidCatalogPath).optional(),
    expectedPackage: z
      .string()
      .max(214)
      .refine(isValidCatalogPackage)
      .optional(),
    expectedVersion: z
      .string()
      .max(CATALOG_VERSION_MAX_LENGTH)
      .refine(isValidCatalogVersion)
      .optional(),
    expectedIntegrity: z.string().startsWith("sha512-").optional(),
    expectedCommit: z
      .string()
      .regex(/^[0-9a-f]{40}$/i)
      .optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    message: z.string(),
    updated: z.boolean().optional(),
  }),
})

// These aliases keep the plugin API stable while sharing the exact validation
// used by official classification and command generation.
export const isValidRepo = isValidCatalogRepository
export const isValidInstallPath = isValidCatalogPath
export const isValidCommit = isValidCatalogCommit
export const isValidRef = isValidCatalogRef
export const getInstallRef = getCatalogInstallRef
export function isPreviewUpdateAvailable(
  installation: Pick<InstalledPlugin, "source" | "version">,
  entry: Pick<DirectoryEntry, "npmPreview">
): boolean {
  return Boolean(
    installation.source === "npm" &&
      installation.version &&
      entry.npmPreview &&
      installation.version !== entry.npmPreview.version
  )
}

export const getRepositoryOwner = getCatalogRepositoryOwner
export function getInstallCommand(
  entry: Pick<
    DirectoryEntry,
    "repo" | "path" | "package" | "version" | "security" | "npm" | "npmPreview"
  >,
  npmSupported = false,
  channel: "stable" | "preview" = "stable"
): string | undefined {
  if (channel === "preview") {
    return npmSupported && entry.package
      ? getCatalogNpmInstallCommandForChannel(entry, "preview")
      : undefined
  }
  if (npmSupported && entry.package) {
    return entry.version
      ? getCatalogNpmInstallCommand(entry.package, entry.version)
      : undefined
  }
  if (!entry.security?.commit) return undefined
  return getCatalogInstallCommand({
    repo: entry.repo,
    path: entry.path,
    ref: entry.security.commit,
  })
}

export function getUpdateCommand(
  installation: Pick<InstalledPlugin, "id" | "management" | "source">,
  entry: Pick<DirectoryEntry, "npm" | "npmPreview" | "security">,
  channel: "stable" | "preview"
): string | undefined {
  if (installation.source === "directory") return undefined
  if (installation.source === "npm") {
    const release = channel === "preview" ? entry.npmPreview : entry.npm
    return release
      ? `paseo plugin update ${installation.id} --version ${release.version}`
      : undefined
  }
  if (channel === "preview") return undefined
  return installation.management === "reviewed" && entry.security?.commit
    ? `paseo plugin update ${installation.id} --ref ${entry.security.commit}`
    : `paseo plugin update ${installation.id}`
}

export function getRepositoryUrl(
  entry: Pick<DirectoryEntry, "repo" | "path" | "security">
): string {
  return getCatalogRepositoryUrl({
    repo: entry.repo,
    path: entry.path,
    ref: entry.security?.commit,
  })
}

export function getRepositoryUrlAtRef(
  entry: Pick<DirectoryEntry, "repo" | "path">,
  ref: string
): string {
  return getCatalogRepositoryUrl({
    repo: entry.repo,
    path: entry.path,
    ref: isValidCatalogCommit(ref) ? ref : undefined,
  })
}

export function getSiteUrl(entry: Pick<DirectoryEntry, "id">): string {
  return `${SITE_URL}/plugins/${encodeURIComponent(entry.id)}`
}

const GITHUB_NEW_ISSUE_URL =
  "https://github.com/paseo-cafe/paseo-cafe/issues/new"

export function getReportPluginIssueUrl(
  entry: Pick<DirectoryEntry, "id" | "repo" | "path" | "security">
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
      `- Source repository: ${getRepositoryUrl(entry)}`,
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
  entry: Pick<DirectoryEntry, "id" | "repo" | "path" | "package">,
  installations: readonly InstalledPlugin[]
): InstalledPlugin[] {
  const expectedRepo = entry.repo.toLowerCase()
  const expectedPath = normalizePluginPath(entry.path)
  return installations.filter((installation) => {
    if (installation.source === "directory") return installation.id === entry.id
    if (installation.source === "npm") {
      return Boolean(
        entry.package && installation.packageName === entry.package
      )
    }
    const installedPath =
      installation.management === "reviewed"
        ? normalizePluginPath(installation.pluginPath)
        : pluginPathFromCheckout(installation.path)
    return (
      githubRepoFromRemote(installation.remote) === expectedRepo &&
      installedPath === expectedPath
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

export const HEALTH_LABELS: Record<string, string> = CATALOG_HEALTH_LABELS
export const HEALTH_KEYS = CATALOG_HEALTH_KEYS
