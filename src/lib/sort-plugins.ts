import type { PluginRecord } from "@/lib/plugin-schema"

export const SORT_KEYS = ["name", "author", "added", "updated"] as const
export type SortKey = (typeof SORT_KEYS)[number]

export const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  author: "Author",
  added: "Added",
  updated: "Updated",
}

/**
 * Who the listing is attributed to. The repo owner, not package.json's
 * `author`, which only about half of plugins fill in — and the owner is what
 * the card itself shows, so ordering by it looks right against the grid.
 */
function authorOf(plugin: PluginRecord): string {
  return plugin.owner?.login ?? plugin.author ?? plugin.repo
}

/** Newest first, with undated records last rather than sorted as if they were ancient. */
function byDateDesc(a: string | undefined, b: string | undefined): number {
  const left = a ? Date.parse(a) : Number.NaN
  const right = b ? Date.parse(b) : Number.NaN
  if (Number.isNaN(left) && Number.isNaN(right)) return 0
  if (Number.isNaN(left)) return 1
  if (Number.isNaN(right)) return -1
  return right - left
}

const COMPARATORS: Record<
  SortKey,
  (a: PluginRecord, b: PluginRecord) => number
> = {
  name: () => 0,
  author: (a, b) => authorOf(a).localeCompare(authorOf(b)),
  added: (a, b) => byDateDesc(a.addedAt, b.addedAt),
  updated: (a, b) => byDateDesc(a.updatedAt, b.updatedAt),
}

/**
 * Orders the listing. Always returns a new array — the catalog behind
 * listPlugins() is a shared module-level snapshot, so sorting in place would
 * reorder it for every other route. Ties fall back to name, so every ordering
 * is total and the grid never shuffles between renders.
 */
export function sortPlugins(
  plugins: PluginRecord[],
  key: SortKey
): PluginRecord[] {
  const compare = COMPARATORS[key]
  return [...plugins].sort(
    (a, b) => compare(a, b) || a.name.localeCompare(b.name)
  )
}
