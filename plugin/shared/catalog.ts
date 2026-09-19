/**
 * Renderer-neutral catalog taxonomy, labels, and formatting shared by this
 * plugin (see ./directory.ts) and the paseo.cafe website
 * (src/lib/registry-schema.ts, src/lib/install-command.ts,
 * src/routes/plugins.$id.tsx). Both a React DOM app and a React Native
 * plugin client/server bundle import this file directly, so it stays free
 * of React, the Paseo SDK, Zod, DOM globals, and Node APIs.
 */

export const CATALOG_VERSION_MAX_LENGTH = 100

/**
 * Descriptions come from a third party's `package.json`/manifest and are
 * parsed as inline markdown once during the catalog scan, so they are bounded
 * where they enter the catalog (scripts/scan.ts) rather than trusted at the
 * length whoever wrote them chose.
 */
export const CATALOG_DESCRIPTION_MAX_LENGTH = 1_000
export const CATALOG_THEME_APPEARANCES = ["light", "dark"] as const
export const CATALOG_THEME_MAX_PER_PLUGIN = 12

export type CatalogThemeAppearance = (typeof CATALOG_THEME_APPEARANCES)[number]

/** The eight seed colors accepted by Paseo's `client.addTheme` API. */
export interface CatalogThemeColors {
  background: string
  foreground: string
  raised: string
  control: string
  border: string
  accent?: string
  mutedForeground: string
  ring: string
}

/** Statically extracted theme contribution used for honest pre-install previews. */
export interface CatalogThemePreview {
  id: string
  name: string
  appearance: CatalogThemeAppearance
  colors: CatalogThemeColors
}

export const CATALOG_THEME_COLOR_KEYS = [
  "background",
  "foreground",
  "raised",
  "control",
  "border",
  "accent",
  "mutedForeground",
  "ring",
] as const satisfies readonly (keyof CatalogThemeColors)[]

export type CatalogThemeColorKey = (typeof CATALOG_THEME_COLOR_KEYS)[number]

export const CATALOG_THEME_COLOR_LABELS: Record<CatalogThemeColorKey, string> =
  {
    background: "Background",
    foreground: "Text",
    raised: "Raised",
    control: "Control",
    border: "Border",
    accent: "Accent",
    mutedForeground: "Muted",
    ring: "Focus",
  }

export function getCatalogThemeColor(
  colors: CatalogThemeColors,
  key: CatalogThemeColorKey
): string {
  return key === "accent" ? (colors.accent ?? colors.foreground) : colors[key]
}

export function isValidCatalogThemeColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

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
const NPM_PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

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
export function isValidCatalogPackage(packageName: string): boolean {
  return packageName.length <= 214 && NPM_PACKAGE_PATTERN.test(packageName)
}
export function isValidCatalogVersion(version: string): boolean {
  if (version.length > CATALOG_VERSION_MAX_LENGTH) return false
  const match = SEMVER_PATTERN.exec(version)
  if (!match) return false
  return !(match[4] ?? "")
    .split(".")
    .some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith("0")
    )
}

function compareNumericIdentifiers(left: string, right: string): number {
  if (left.length !== right.length) return left.length < right.length ? -1 : 1
  return left === right ? 0 : left < right ? -1 : 1
}

/** SemVer precedence without importing a runtime dependency into client bundles. */
export function compareCatalogVersions(
  left: string,
  right: string
): number | undefined {
  if (!isValidCatalogVersion(left) || !isValidCatalogVersion(right)) {
    return undefined
  }
  const leftMatch = SEMVER_PATTERN.exec(left)
  const rightMatch = SEMVER_PATTERN.exec(right)
  if (!leftMatch || !rightMatch) return undefined

  let comparison = compareNumericIdentifiers(
    leftMatch[1] ?? "0",
    rightMatch[1] ?? "0"
  )
  if (comparison !== 0) return comparison
  comparison = compareNumericIdentifiers(
    leftMatch[2] ?? "0",
    rightMatch[2] ?? "0"
  )
  if (comparison !== 0) return comparison
  comparison = compareNumericIdentifiers(
    leftMatch[3] ?? "0",
    rightMatch[3] ?? "0"
  )
  if (comparison !== 0) return comparison

  const leftPrerelease = leftMatch[4]
  const rightPrerelease = rightMatch[4]
  if (leftPrerelease === undefined || rightPrerelease === undefined) {
    if (leftPrerelease === rightPrerelease) return 0
    return leftPrerelease === undefined ? 1 : -1
  }

  const leftIdentifiers = leftPrerelease.split(".")
  const rightIdentifiers = rightPrerelease.split(".")
  const count = Math.max(leftIdentifiers.length, rightIdentifiers.length)
  for (let index = 0; index < count; index += 1) {
    const leftIdentifier = leftIdentifiers[index]
    const rightIdentifier = rightIdentifiers[index]
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1
    }
    if (leftIdentifier === rightIdentifier) continue
    const leftNumeric = /^\d+$/.test(leftIdentifier)
    const rightNumeric = /^\d+$/.test(rightIdentifier)
    if (leftNumeric && rightNumeric) {
      return compareNumericIdentifiers(leftIdentifier, rightIdentifier)
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftIdentifier < rightIdentifier ? -1 : 1
  }
  return 0
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
export function getCatalogNpmInstallArgs(
  packageName: string,
  version: string
): string[] | undefined {
  return isValidCatalogPackage(packageName) && isValidCatalogVersion(version)
    ? [`npm:${packageName}@${version}`]
    : undefined
}

export function getCatalogNpmInstallCommand(
  packageName: string,
  version: string
): string | undefined {
  const args = getCatalogNpmInstallArgs(packageName, version)
  return args ? ["paseo", "plugin", "add", ...args].join(" ") : undefined
}

export type CatalogReleaseChannel = "stable" | "preview"

/**
 * Returns an immutable npm release for the requested channel. Preview is
 * deliberately optional so old catalog consumers retain stable-only behavior.
 */
export function getCatalogNpmRelease(
  entry: {
    package?: string
    npm?: { package: string; version: string; integrity: string }
    npmPreview?: { package: string; version: string; integrity: string }
  },
  channel: CatalogReleaseChannel = "stable"
): { package: string; version: string; integrity: string } | undefined {
  const release = channel === "preview" ? entry.npmPreview : entry.npm
  if (
    !release ||
    release.package !== entry.package ||
    !isValidCatalogPackage(release.package) ||
    !isValidCatalogVersion(release.version) ||
    !release.integrity.startsWith("sha512-")
  ) {
    return undefined
  }
  return release
}

export function getCatalogNpmInstallCommandForChannel(
  entry: {
    package?: string
    npm?: { package: string; version: string; integrity: string }
    npmPreview?: { package: string; version: string; integrity: string }
  },
  channel: CatalogReleaseChannel = "stable"
): string | undefined {
  const release = getCatalogNpmRelease(entry, channel)
  return release
    ? getCatalogNpmInstallCommand(release.package, release.version)
    : undefined
}

export function getCatalogPreferredInstallCommand(entry: {
  package?: string
  version?: string
  repo: string
  path?: string
  ref?: string
}): string | undefined {
  if (entry.package) {
    return entry.version
      ? getCatalogNpmInstallCommand(entry.package, entry.version)
      : undefined
  }
  return getCatalogInstallCommand(entry)
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
export const CATALOG_ADDED_AT_LABEL = "Recent"

export interface CatalogAddedAt {
  addedAt?: string
}

/** Epoch milliseconds for a catalog timestamp; 0 when missing or unparseable. */
export function getCatalogAddedAtTime(entry: CatalogAddedAt): number {
  const parsed = entry.addedAt ? Date.parse(entry.addedAt) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
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
export interface CatalogNpmMetrics {
  npm?: {
    downloadsLast30Days?: number
    publishedAt?: string
  }
  repoMeta?: { stars?: number }
  addedAt?: string
}
export function hasCompleteCatalogNpmMetrics(
  entry: CatalogNpmMetrics
): entry is CatalogNpmMetrics & {
  npm: { downloadsLast30Days: number; publishedAt: string }
} {
  return (
    entry.npm?.downloadsLast30Days !== undefined &&
    entry.npm.publishedAt !== undefined
  )
}

/** npm-backed entries always precede Git-only entries. */
export function compareCatalogSource(
  a: CatalogNpmMetrics,
  b: CatalogNpmMetrics
): number {
  return (
    Number(hasCompleteCatalogNpmMetrics(b)) -
    Number(hasCompleteCatalogNpmMetrics(a))
  )
}

function getCatalogNpmPublishedAtTime(entry: CatalogNpmMetrics): number {
  const parsed = entry.npm?.publishedAt
    ? Date.parse(entry.npm.publishedAt)
    : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** npm downloads/date first; Git-only entries retain their star ordering. */
export function compareCatalogPopularity(
  a: CatalogNpmMetrics,
  b: CatalogNpmMetrics
): number {
  const source = compareCatalogSource(a, b)
  if (source !== 0) return source
  if (hasCompleteCatalogNpmMetrics(a) && hasCompleteCatalogNpmMetrics(b)) {
    return (
      b.npm.downloadsLast30Days - a.npm.downloadsLast30Days ||
      getCatalogNpmPublishedAtTime(b) - getCatalogNpmPublishedAtTime(a)
    )
  }
  return (b.repoMeta?.stars ?? 0) - (a.repoMeta?.stars ?? 0)
}

/** Latest npm releases first, then Git-only entries by catalog listing date. */
export function compareCatalogRecency(
  a: CatalogNpmMetrics,
  b: CatalogNpmMetrics
): number {
  const source = compareCatalogSource(a, b)
  if (source !== 0) return source
  if (hasCompleteCatalogNpmMetrics(a) && hasCompleteCatalogNpmMetrics(b)) {
    return getCatalogNpmPublishedAtTime(b) - getCatalogNpmPublishedAtTime(a)
  }
  return compareCatalogAddedAt(a, b)
}

export function isCatalogRecencyKnown(entry: CatalogNpmMetrics): boolean {
  return hasCompleteCatalogNpmMetrics(entry)
    ? getCatalogNpmPublishedAtTime(entry) > 0
    : isCatalogAddedAtKnown(entry)
}

export function formatCatalogCompactCount(value: number): string {
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}M`.replace(
      ".0M",
      "M"
    )
  }
  if (value >= 1_000) {
    const scaled = value / 1_000
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}k`.replace(
      ".0k",
      "k"
    )
  }
  return `${value}`
}

export function formatCatalogDownloads(downloads: number): string {
  const count = `${downloads}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${count} ${downloads === 1 ? "download" : "downloads"} / 30 days`
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

/** "Published Sep 11, 2026", or undefined when npm metadata is unavailable. */
export function getCatalogPublishedDateBadge(
  entry: CatalogNpmMetrics,
  locale?: string
): string | undefined {
  const formatted = entry.npm?.publishedAt
    ? formatCatalogDateForReader(entry.npm.publishedAt, locale)
    : undefined
  return formatted && `Published ${formatted}`
}
