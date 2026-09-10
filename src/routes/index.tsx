import { createFileRoute } from "@tanstack/react-router"
import { useMemo } from "react"
import { z } from "zod"
import { HomeHero } from "@/components/home-hero"
import { PluginGrid } from "@/components/plugin-grid"
import { PluginSidebar } from "@/components/plugin-sidebar"
import { listPlugins } from "@/lib/plugins-data"
import { seo } from "@/lib/seo"
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site"
import { sortPlugins, SORT_VALUES } from "@/lib/sort-plugins"

/**
 * Search, category, and sort all live in the URL (?q=&category=&sort=)
 * rather than component state, so following a plugin link and hitting the
 * browser's back button lands you back on the same filtered/sorted view
 * instead of a reset one. The default sort ("latest") is treated as absent
 * so the URL stays clean when nothing's been changed from the default.
 */
const homeSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  sort: z.enum(SORT_VALUES).optional().catch(undefined),
})

export const Route = createFileRoute("/")({
  head: () =>
    seo({ title: SITE_NAME, description: SITE_DESCRIPTION, path: "/" }),
  component: App,
  loader: () => listPlugins(),
  validateSearch: homeSearchSchema,
})

function App() {
  const plugins = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const query = search.q ?? ""
  const category = search.category ?? null
  const sort = search.sort ?? "latest"

  // Filter/sort changes replace the current history entry instead of
  // pushing a new one — otherwise every keystroke or filter click would add
  // a back-button stop of its own. The URL (and thus the state) is still
  // fully restored when navigating back from a plugin's own page.
  const setQuery = (q: string) =>
    navigate({
      search: (prev) => ({ ...prev, q: q || undefined }),
      replace: true,
    })
  const setCategory = (next: string | null) =>
    navigate({
      search: (prev) => ({ ...prev, category: next ?? undefined }),
      replace: true,
    })
  const setSort = (next: (typeof SORT_VALUES)[number]) =>
    navigate({
      search: (prev) => ({
        ...prev,
        sort: next === "latest" ? undefined : next,
      }),
      replace: true,
    })

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const plugin of plugins)
      for (const c of plugin.categories) counts.set(c, (counts.get(c) ?? 0) + 1)
    return counts
  }, [plugins])

  const categories = useMemo(
    () => Array.from(categoryCounts.keys()).sort(),
    [categoryCounts]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = plugins.filter((plugin) => {
      if (category && !plugin.categories.includes(category)) return false
      if (!q) return true
      return (
        plugin.name.toLowerCase().includes(q) ||
        plugin.description.toLowerCase().includes(q) ||
        plugin.id.toLowerCase().includes(q)
      )
    })
    return sortPlugins(matches, sort)
  }, [plugins, query, category, sort])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 pb-20">
      <HomeHero />

      <p className="text-foreground/60 text-sm">
        {query || category
          ? `${filtered.length} of ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} found.`
          : `${plugins.length} plugin${plugins.length === 1 ? "" : "s"} generated from their source repos.`}
      </p>
      <div className="mx-auto flex w-full flex-col-reverse gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <PluginGrid plugins={filtered} />
        </div>
        <PluginSidebar
          query={query}
          onQueryChange={setQuery}
          sort={sort}
          onSortChange={setSort}
          category={category}
          onCategoryChange={setCategory}
          categories={categories}
          categoryCounts={categoryCounts}
          totalCount={plugins.length}
        />
      </div>
    </div>
  )
}
