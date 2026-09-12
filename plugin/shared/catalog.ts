/**
 * Renderer-neutral catalog taxonomy, labels, and formatting shared by this
 * plugin (see ./directory.ts) and the paseo.cafe website
 * (src/lib/registry-schema.ts, src/lib/install-command.ts,
 * src/routes/plugins.$id.tsx). Both a React DOM app and a React Native
 * plugin client/server bundle import this file directly, so it stays free
 * of React, the Paseo SDK, Zod, DOM globals, and Node APIs.
 */

export const CATALOG_VERSION_MAX_LENGTH = 100

/** Presents normalized package versions consistently across catalog surfaces. */
export function formatCatalogVersion(
  version: string | undefined
): string | undefined {
  return version ? `v${version}` : undefined
}

export const CATALOG_PLATFORMS = ["macos", "linux", "windows"] as const

export type CatalogPlatform = (typeof CATALOG_PLATFORMS)[number]

export const CATALOG_PLATFORM_LABELS: Record<CatalogPlatform, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
}

export const OFFICIAL_GITHUB_ORG = "paseo-cafe"

const REPOSITORY_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/
const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/
const GIT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/i

export function isValidCatalogRepository(repo: string): boolean {
  return REPOSITORY_PATTERN.test(repo)
}

export function isValidCatalogPath(path: string): boolean {
  const segments = path.split("/")
  return segments.every(
    (segment) => segment !== ".." && PATH_SEGMENT_PATTERN.test(segment)
  )
}

export function isValidCatalogCommit(commit: string): boolean {
  return GIT_COMMIT_PATTERN.test(commit)
}

export function isValidCatalogRef(ref: string): boolean {
  return (
    GIT_REF_PATTERN.test(ref) &&
    !ref.includes("..") &&
    !ref.includes("@{") &&
    !ref.includes("//") &&
    !ref.endsWith("/") &&
    !ref.endsWith(".") &&
    !ref.endsWith(".lock")
  )
}

export function getCatalogInstallRef(
  ref: string | undefined
): string | undefined {
  return ref !== undefined && isValidCatalogRef(ref) ? ref : undefined
}

export function getCatalogRepositoryOwner(repo: string): string {
  return repo.split("/")[0] ?? repo
}

export function getCatalogRepositoryUrl(entry: {
  repo: string
  path?: string
  ref?: string
}): string {
  const base = `https://github.com/${entry.repo}`
  if (entry.ref) {
    return `${base}/tree/${entry.ref}${entry.path ? `/${entry.path}` : ""}`
  }
  return entry.path ? `${base}/tree/HEAD/${entry.path}` : base
}

export function isOfficialCatalogPlugin(entry: { repo: string }): boolean {
  return (
    isValidCatalogRepository(entry.repo) &&
    getCatalogRepositoryOwner(entry.repo).toLowerCase() === OFFICIAL_GITHUB_ORG
  )
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
export function getCatalogInstallArgs(entry: {
  repo: string
  path?: string
  ref?: string
}): string[] | undefined {
  if (!isValidCatalogRepository(entry.repo)) return undefined
  if (entry.path !== undefined && !isValidCatalogPath(entry.path)) {
    return undefined
  }

  const ref = getCatalogInstallRef(entry.ref)
  return [
    entry.repo,
    ...(ref ? ["--ref", ref] : []),
    ...(entry.path ? ["--path", entry.path] : []),
  ]
}

export function getCatalogInstallCommand(entry: {
  repo: string
  path?: string
  ref?: string
}): string | undefined {
  const args = getCatalogInstallArgs(entry)
  return args ? ["paseo", "plugin", "add", ...args].join(" ") : undefined
}

export type CatalogHealthCheck =
  | "manifestValid"
  | "hasReadme"
  | "hasLicense"
  | "hasTests"
  | "hasTypecheckScript"
  | "updatedRecently"

// User-facing health excludes repository activity: plugin updates are defined
// by package.json semver, not by unrelated pushes to a source repository.
export const CATALOG_HEALTH_KEYS = [
  "manifestValid",
  "hasReadme",
  "hasLicense",
  "hasTests",
  "hasTypecheckScript",
] as const satisfies readonly CatalogHealthCheck[]

export const CATALOG_HEALTH_LABELS: Record<CatalogHealthCheck, string> = {
  manifestValid: "Manifest ID matches registry",
  hasReadme: "Has a README",
  hasLicense: "Has a license",
  hasTests: "Has tests",
  hasTypecheckScript: "Has a typecheck script",
  updatedRecently: "Repository active in the last 6 months",
}

/**
 * When a plugin's registry entry first landed in this repository's git
 * history (ISO 8601) — i.e. when the catalog accepted it. The scanner
 * derives it (see scripts/scan.ts on the website); it is never hand-authored,
 * so it can't be backdated or nudged forward by a submitter, and it means
 * the same thing on both surfaces. It is absent when the history isn't
 * available (a shallow clone, or an entry that isn't committed yet).
 */
export const CATALOG_ADDED_AT_LABEL = "Recently added"

export interface CatalogAddedAt {
  addedAt?: string
}

/** Epoch milliseconds for a catalog timestamp; 0 when missing or unparseable. */
export function getCatalogAddedAtTime(entry: CatalogAddedAt): number {
  const parsed = entry.addedAt ? Date.parse(entry.addedAt) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/** Whether an entry has a usable catalog-listing timestamp. */
export function isCatalogAddedAtKnown(entry: CatalogAddedAt): boolean {
  return getCatalogAddedAtTime(entry) > 0
}

/**
 * Most recently listed first. Entries with no known date sort last rather
 * than first, so a missing date never fakes its way to the top of the list.
 * Callers break ties with their own stable ordering.
 */
export function compareCatalogAddedAt(
  a: CatalogAddedAt,
  b: CatalogAddedAt
): number {
  return getCatalogAddedAtTime(b) - getCatalogAddedAtTime(a)
}

const CATALOG_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/**
 * "2026-09-08T01:09:51Z" -> "08 Sep 2026". Built by hand from UTC fields
 * rather than through Intl: the website renders this on the server and again
 * in the browser, and a locale or ICU difference between the two is a React
 * hydration mismatch. Undefined for anything unparseable, so a bad date shows
 * nothing rather than "NaN".
 */
export function formatCatalogDate(iso: string): string | undefined {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return undefined
  const date = new Date(parsed)
  const day = String(date.getUTCDate()).padStart(2, "0")
  return `${day} ${CATALOG_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * The reader's own rendering of the same instant: Intl picks the field order
 * and month name from their locale, and the day is the one their clock shows,
 * so "Sep 11, 2026" for en-US and "11 Sept 2026" for en-GB.
 *
 * Falls back to formatCatalogDate for anything Intl can't do. That matters in
 * two real places: a React Native runtime built without full ICU, and the
 * website's server render, which happens before the reader's locale and time
 * zone are knowable — see ReaderDate in src/components/reader-date.tsx, which
 * renders the fallback and swaps to this once mounted.
 */
export function formatCatalogDateForReader(
  iso: string,
  locale?: string
): string | undefined {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return undefined
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) {
    return formatCatalogDate(iso)
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(parsed))
  } catch {
    return formatCatalogDate(iso)
  }
}

/** "Added Sep 11, 2026", or undefined when the listing date is unknown. */
export function getCatalogAddedDateBadge(
  entry: CatalogAddedAt,
  locale?: string
): string | undefined {
  const formatted = entry.addedAt
    ? formatCatalogDateForReader(entry.addedAt, locale)
    : undefined
  return formatted && `Added ${formatted}`
}
