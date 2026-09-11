import { z } from "zod"
import type { PluginRecord } from "@/lib/plugin-schema"
import {
  CATEGORY_LABELS,
  type Category,
  PLATFORMS,
  type Platform,
} from "@/lib/registry-schema"
import {
  CATALOG_ADDED_AT_LABEL,
  compareCatalogAddedAt,
} from "../../plugin/shared/catalog"

/**
 * Search-param shape, defaults, parsing, and sorting shared by the homepage
 * catalog (src/routes/index.tsx) and anything that links back into it
 * (header logo, back links, pagination) or renders its filter/results UI
 * (src/components/catalog-sidebar.tsx, src/components/catalog-results.tsx).
 */

export const HOME_SEARCH_DEFAULT = {
  q: "",
  category: "",
  platform: "",
  sort: "popular",
  page: 1,
} as const

const sortValues = ["popular", "updated", "added", "az"] as const
export type SortValue = (typeof sortValues)[number]

function normalizeCategoryFilter(category: string): Category | "" {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, "-")
  return Object.hasOwn(CATEGORY_LABELS, normalized)
    ? (normalized as Category)
    : ""
}

function normalizePlatformFilter(platform: string): Platform | "" {
  const normalized = platform.trim().toLowerCase()
  return (PLATFORMS as readonly string[]).includes(normalized)
    ? (normalized as Platform)
    : ""
}

export const routeSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  category: z
    .string()
    .optional()
    .catch(undefined)
    .transform((category) =>
      category === undefined ? undefined : normalizeCategoryFilter(category)
    ),
  platform: z
    .string()
    .optional()
    .catch(undefined)
    .transform((platform) =>
      platform === undefined ? undefined : normalizePlatformFilter(platform)
    ),
  sort: z.enum(sortValues).optional().catch(undefined),
  page: z.coerce.number().int().positive().optional().catch(undefined),
})

export interface CatalogSearch {
  q: string
  category: Category | ""
  platform: Platform | ""
  sort: SortValue
  page: number
}

export function parseCatalogSearch(search: unknown): CatalogSearch {
  const parsed = routeSearchSchema.parse(search)
  return {
    q: parsed.q ?? HOME_SEARCH_DEFAULT.q,
    category: parsed.category ?? HOME_SEARCH_DEFAULT.category,
    platform: parsed.platform ?? HOME_SEARCH_DEFAULT.platform,
    sort: parsed.sort ?? HOME_SEARCH_DEFAULT.sort,
    page: parsed.page ?? HOME_SEARCH_DEFAULT.page,
  }
}

export function clampCatalogPage(page: number, totalPages: number): number {
  return Math.min(page, Math.max(1, totalPages))
}

export const sortLabels: Record<SortValue, string> = {
  popular: "Popular",
  updated: "Recently updated",
  added: CATALOG_ADDED_AT_LABEL,
  az: "A–Z",
}

export const sortOptions: SortValue[] = ["popular", "updated", "added", "az"]

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

function comparePluginsByName(a: PluginRecord, b: PluginRecord): number {
  return collator.compare(a.name, b.name) || collator.compare(a.id, b.id)
}

export function sortPlugins(
  plugins: PluginRecord[],
  sort: SortValue
): PluginRecord[] {
  return [...plugins].sort((a, b) => {
    switch (sort) {
      case "popular":
        return (
          (b.repoMeta?.stars ?? 0) - (a.repoMeta?.stars ?? 0) ||
          comparePluginsByName(a, b)
        )
      case "updated":
        return (
          (Date.parse(b.repoMeta?.pushedAt ?? "") || 0) -
            (Date.parse(a.repoMeta?.pushedAt ?? "") || 0) ||
          comparePluginsByName(a, b)
        )
      case "added":
        return compareCatalogAddedAt(a, b) || comparePluginsByName(a, b)
      case "az":
        return comparePluginsByName(a, b)
      default:
        return 0
    }
  })
}

export function matchesPluginQuery(
  plugin: PluginRecord,
  query: string
): boolean {
  const haystack = [
    plugin.name,
    plugin.description,
    plugin.id,
    plugin.repo,
    plugin.author,
    plugin.owner?.login,
    plugin.categories.join(" "),
    plugin.platforms.join(" "),
    plugin.caveats.join(" "),
    plugin.limitationsNotes,
    plugin.paseoVersionRequirement,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return haystack.includes(query.toLowerCase())
}
