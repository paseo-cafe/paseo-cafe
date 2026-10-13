import type {
  DirectoryBrowseSettings,
  DirectoryCategory,
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import { findInstallations } from "../shared/directory"
import { hasAvailableUpdate } from "./update-status"

/**
 * Filtering and highlight selection for the directory list, kept out of
 * DirectorySurface.tsx so it can be tested without mocking React Native and
 * the Paseo SDK.
 */

export type InstallationStatusFilter = DirectoryBrowseSettings["status"]

type InstallationsByEntryId = ReadonlyMap<string, readonly InstalledPlugin[]>

/** Installations per listing id; listings with none are absent. */
export function indexInstallations(
  entries: readonly DirectoryEntry[],
  installations: readonly InstalledPlugin[],
  registryUrl: string
): Map<string, InstalledPlugin[]> {
  const index = new Map<string, InstalledPlugin[]>()
  for (const entry of entries) {
    const matches = findInstallations(entry, installations, registryUrl)
    if (matches.length > 0) index.set(entry.id, matches)
  }
  return index
}

/**
 * Keeps entries whose searchable text contains the query and, when any
 * categories are selected, that have at least one of them. Searchable text is
 * the listing id, name, description, author and categories (slug and label).
 */
export function filterBySearchAndCategories(
  entries: readonly DirectoryEntry[],
  query: string,
  categories: ReadonlySet<string>,
  categoryLabels: ReadonlyMap<string, string>
): DirectoryEntry[] {
  const needle = query.trim().toLowerCase()
  return entries.filter((entry) => {
    if (
      categories.size > 0 &&
      !entry.categories.some((category) => categories.has(category))
    ) {
      return false
    }
    if (!needle) return true
    const haystack = [
      entry.id,
      entry.name,
      entry.description,
      entry.author.github,
      entry.author.name,
      ...entry.categories,
      ...entry.categories.map((category) => categoryLabels.get(category)),
    ]
      .filter((value): value is string => Boolean(value))
      .join(" ")
      .toLowerCase()
    return haystack.includes(needle)
  })
}

function matchesStatus(
  matches: readonly InstalledPlugin[],
  status: InstallationStatusFilter,
  updates: ReadonlyMap<string, PluginUpdate>
): boolean {
  if (status === "installed") return matches.length > 0
  if (status === "not-installed") return matches.length === 0
  if (status === "updates") return hasAvailableUpdate(matches, updates)
  return true
}

export function filterByStatus(
  entries: readonly DirectoryEntry[],
  status: InstallationStatusFilter,
  installationsByEntryId: InstallationsByEntryId,
  updates: ReadonlyMap<string, PluginUpdate>
): DirectoryEntry[] {
  return entries.filter((entry) =>
    matchesStatus(installationsByEntryId.get(entry.id) ?? [], status, updates)
  )
}

/** How many entries each status filter would show, for the filter chips. */
export function countByStatus(
  entries: readonly DirectoryEntry[],
  installationsByEntryId: InstallationsByEntryId,
  updates: ReadonlyMap<string, PluginUpdate>
): Record<InstallationStatusFilter, number> {
  const counts = {
    all: entries.length,
    installed: 0,
    updates: 0,
    "not-installed": 0,
  }
  for (const entry of entries) {
    const matches = installationsByEntryId.get(entry.id) ?? []
    counts.installed += Number(matchesStatus(matches, "installed", updates))
    counts.updates += Number(matchesStatus(matches, "updates", updates))
    counts["not-installed"] += Number(
      matchesStatus(matches, "not-installed", updates)
    )
  }
  return counts
}

export interface CategoryOption {
  slug: string
  label: string
  count: number
}

/** The registry's categories, in its order, that at least one listing uses. */
export function categoryOptions(
  entries: readonly DirectoryEntry[],
  categories: readonly DirectoryCategory[]
): CategoryOption[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const slug of new Set(entry.categories)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }
  }
  return categories.flatMap(({ slug, label }) => {
    const count = counts.get(slug) ?? 0
    return count > 0 ? [{ slug, label, count }] : []
  })
}

/**
 * The same chips recounted against the entries a category would be applied to
 * (the current search and status filter, minus the category selection), so a
 * chip reports how many results it would show. Chips stay listed at zero so a
 * selected category never disappears from under the user.
 */
export function recountCategories(
  options: readonly CategoryOption[],
  entries: readonly DirectoryEntry[]
): CategoryOption[] {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const slug of new Set(entry.categories)) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }
  }
  return options.map((option) => ({
    ...option,
    count: counts.get(option.slug) ?? 0,
  }))
}

/** The registry's featured listings, in the registry's order; unknown ids are skipped. */
export function selectFeatured(
  entries: readonly DirectoryEntry[],
  featuredIds: readonly string[]
): DirectoryEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  return Array.from(new Set(featuredIds)).flatMap((id) => {
    const entry = byId.get(id)
    return entry ? [entry] : []
  })
}

/** Registry slug of the category that marks a listing as a theme. */
export const THEMES_CATEGORY = "themes"

/**
 * Splits listings into themes (those in the `themes` category) and everything
 * else, each in the input order. Categories overlap, so a listing is a theme
 * if it carries the slug at all.
 */
export function splitThemes<T extends { categories: readonly string[] }>(
  entries: readonly T[]
): { themes: T[]; plugins: T[] } {
  const themes: T[] = []
  const plugins: T[] = []
  for (const entry of entries) {
    if (entry.categories.includes(THEMES_CATEGORY)) themes.push(entry)
    else plugins.push(entry)
  }
  return { themes, plugins }
}

export function invalidListingsNotice(count: number): string | null {
  if (count <= 0) return null
  return count === 1
    ? "1 listing failed validation and is hidden."
    : `${count} listings failed validation and are hidden.`
}
