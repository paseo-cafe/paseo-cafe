import type { PluginRecord } from "@/lib/plugin-schema"

/**
 * Homepage sort options. "latest" (newest addition to the directory first)
 * is the default — see addedAt on PluginRecord for how that's derived.
 * "stars" and "updated" both read straight off repoMeta, which the scanner
 * (scripts/scan.ts) always populates from the GitHub repo API.
 *
 * SORT_VALUES is the tuple form (mirrors PLATFORMS in registry-schema.ts) so
 * the homepage route can build a `z.enum(SORT_VALUES)` for its ?sort= search
 * param without duplicating the list of valid values.
 */
export const SORT_VALUES = ["latest", "stars", "updated"] as const
export type SortOption = (typeof SORT_VALUES)[number]

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "stars", label: "Most starred" },
  { value: "updated", label: "Recently updated" },
]

function time(iso: string): number {
  return new Date(iso).getTime()
}

/** Newest-first by default so a broken scan (no repoMeta) never crashes the sort. */
export function sortPlugins(
  plugins: PluginRecord[],
  sort: SortOption
): PluginRecord[] {
  const sorted = [...plugins]
  switch (sort) {
    case "stars":
      sorted.sort((a, b) => (b.repoMeta?.stars ?? 0) - (a.repoMeta?.stars ?? 0))
      break
    case "updated":
      sorted.sort(
        (a, b) =>
          time(b.repoMeta?.pushedAt ?? b.scannedAt) -
          time(a.repoMeta?.pushedAt ?? a.scannedAt)
      )
      break
    default:
      sorted.sort((a, b) => time(b.addedAt) - time(a.addedAt))
  }
  return sorted
}
