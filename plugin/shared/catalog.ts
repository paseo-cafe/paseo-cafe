/**
 * Renderer-neutral catalog taxonomy, labels, and formatting shared by this
 * plugin (see ./directory.ts) and the paseo.cafe website
 * (src/lib/registry-schema.ts, src/lib/install-command.ts,
 * src/routes/plugins.$id.tsx). Both a React DOM app and a React Native
 * plugin client/server bundle import this file directly, so it stays free
 * of React, the Paseo SDK, Zod, DOM globals, and Node APIs.
 */

export const CATALOG_PLATFORMS = ["macos", "linux", "windows"] as const

export type CatalogPlatform = (typeof CATALOG_PLATFORMS)[number]

export const CATALOG_PLATFORM_LABELS: Record<CatalogPlatform, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
}

export const OFFICIAL_GITHUB_ORG = "paseo-cafe"

export function isOfficialCatalogPlugin(entry: {
  owner?: { login?: string }
}): boolean {
  return entry.owner?.login?.toLowerCase() === OFFICIAL_GITHUB_ORG
}

export const CATALOG_CATEGORIES = [
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

export type CatalogCategory = (typeof CATALOG_CATEGORIES)[number]

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
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

/** Maps filter input onto the stable catalog taxonomy without inventing a match. */
export function normalizeCatalogCategoryFilter(
  category: string
): CatalogCategory | "" {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, "-")
  return Object.hasOwn(CATALOG_CATEGORY_LABELS, normalized)
    ? (normalized as CatalogCategory)
    : ""
}

/** Maps catalog-provided categories onto the stable taxonomy, defaulting to "other". */
export function normalizeCatalogCategory(category: string): CatalogCategory {
  return normalizeCatalogCategoryFilter(category) || "other"
}

/** Canonicalizes catalog categories while preserving their stable slug order. */
export function normalizeCatalogCategories(
  categories: readonly string[]
): CatalogCategory[] {
  const present = new Set(categories.map(normalizeCatalogCategory))
  return CATALOG_CATEGORIES.filter((category) => present.has(category))
}

/**
 * The canonical install command for a plugin, derived purely from the
 * repo/path already validated on its listing, using the real
 * `paseo plugin add` CLI (https://paseo.sh/docs/plugins/reference). Never
 * depends on README parsing, so it's always correct even when an author's
 * own install instructions are missing, stale, or inconsistent.
 */
export function getCatalogInstallCommand(entry: {
  repo: string
  path?: string
}): string {
  return entry.path
    ? `paseo plugin add ${entry.repo} --path ${entry.path}`
    : `paseo plugin add ${entry.repo}`
}

export type CatalogHealthCheck =
  | "manifestValid"
  | "hasReadme"
  | "hasLicense"
  | "hasTests"
  | "hasTypecheckScript"
  | "updatedRecently"

export const CATALOG_HEALTH_LABELS: Record<CatalogHealthCheck, string> = {
  manifestValid: "Manifest ID matches registry",
  hasReadme: "Has a README",
  hasLicense: "Has a license",
  hasTests: "Has tests",
  hasTypecheckScript: "Has a typecheck script",
  updatedRecently: "Updated in the last 6 months",
}
