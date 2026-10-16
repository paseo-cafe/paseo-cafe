import type {
  DirectoryBrowseSettings,
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import type { PluginRowDateBadge } from "./PluginRow"
import { hasAvailableUpdate } from "./update-status"

/**
 * Ordering for the directory list, kept out of DirectorySurface.tsx so it can
 * be tested without mocking React Native and the Paseo SDK.
 */

export type SortMode = DirectoryBrowseSettings["sort"]

/** Timestamp of a registry date; unparseable dates become -Infinity so they sort last. */
function timestamp(value: string): number {
  const time = Date.parse(value)
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time
}

/** Larger values first. Not `b - a`: that is NaN for two -Infinity values. */
function compareDescending(a: number, b: number): number {
  if (a > b) return -1
  if (a < b) return 1
  return 0
}

/**
 * Plain lexicographic comparison on trimmed, lowercased text. Deliberately not
 * Intl.Collator, so the order is identical on every runtime.
 */
function compareText(a: string, b: string): number {
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/**
 * Which date the list is ordered by, so a row can report the date it is
 * actually sorted on rather than whichever one it happens to have.
 */
export function dateBadgeForSortMode(
  sortMode: SortMode
): PluginRowDateBadge | undefined {
  if (sortMode === "recent") return "updated"
  if (sortMode === "recently-added") return "added"
  return undefined
}

function compareByMode(
  a: DirectoryEntry,
  b: DirectoryEntry,
  sortMode: SortMode,
  installationsByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>,
  updates: ReadonlyMap<string, PluginUpdate>
): number {
  switch (sortMode) {
    case "updates-first":
      return (
        compareDescending(
          Number(
            hasAvailableUpdate(installationsByEntryId.get(a.id) ?? [], updates)
          ),
          Number(
            hasAvailableUpdate(installationsByEntryId.get(b.id) ?? [], updates)
          )
        ) || compareDescending(a.installs ?? 0, b.installs ?? 0)
      )
    case "popular":
      return compareDescending(a.installs ?? 0, b.installs ?? 0)
    case "recent":
      return compareDescending(timestamp(a.updatedAt), timestamp(b.updatedAt))
    case "recently-added":
      return compareDescending(
        timestamp(a.publishedAt),
        timestamp(b.publishedAt)
      )
    case "a-z":
      return compareText(a.name, b.name)
  }
}

/**
 * Returns a sorted copy; the input array is left untouched. Every mode ends on
 * the listing id, so entries whose sort key ties keep a stable, repeatable
 * order instead of shuffling between renders.
 */
export function sortEntries(
  entries: readonly DirectoryEntry[],
  sortMode: SortMode,
  installationsByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>,
  updates: ReadonlyMap<string, PluginUpdate>
): DirectoryEntry[] {
  return [...entries].sort(
    (a, b) =>
      compareByMode(a, b, sortMode, installationsByEntryId, updates) ||
      compareText(a.id, b.id)
  )
}
