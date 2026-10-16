/**
 * The two semver operations this plugin needs — parse a released version and
 * order it against another — written out so the published package carries no
 * runtime dependency, and therefore no installation tree to lock or review.
 *
 * Follows semver.org precedence: numeric core fields compare numerically, a
 * prerelease sorts below its own release, and prerelease identifiers compare
 * field by field with numeric ones below alphanumeric ones.
 */

const VERSION_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:[0-9A-Za-z-]+)(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const NUMERIC_IDENTIFIER = /^(?:0|[1-9]\d*)$/

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: readonly string[]
}

/** Null for anything that is not a single, complete semver version. */
export function parseVersion(text: string): ParsedVersion | null {
  const match = VERSION_PATTERN.exec(text.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split("."),
  }
}

function comparePrerelease(a: readonly string[], b: readonly string[]): number {
  // A version with a prerelease ranks below the same version without one.
  if (a.length === 0 || b.length === 0) {
    if (a.length === b.length) return 0
    return a.length === 0 ? 1 : -1
  }
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i]
    const right = b[i]
    // A shorter set of identifiers ranks below an otherwise equal longer one.
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    const leftNumeric = NUMERIC_IDENTIFIER.test(left)
    const rightNumeric = NUMERIC_IDENTIFIER.test(right)
    if (leftNumeric && rightNumeric)
      return Number(left) < Number(right) ? -1 : 1
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return left < right ? -1 : 1
  }
  return 0
}

export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return comparePrerelease(a.prerelease, b.prerelease)
}

/** False when `text` is not a version, so unparseable output never passes. */
export function isVersionAtLeast(text: string, minimum: string): boolean {
  const version = parseVersion(text)
  const floor = parseVersion(minimum)
  if (!version || !floor) return false
  return compareVersions(version, floor) >= 0
}
