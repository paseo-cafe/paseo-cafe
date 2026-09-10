import { IconSearch } from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo } from "react"
import { z } from "zod"
import { PluginCard } from "@/components/plugin-card"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { listPlugins } from "@/lib/plugins-data"
import { seo } from "@/lib/seo"
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site"
import { SORT_OPTIONS, sortPlugins, SORT_VALUES } from "@/lib/sort-plugins"

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
  const setSort = (next: (typeof SORT_OPTIONS)[number]["value"]) =>
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
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 pt-16 pb-2 text-center">
        <div className="mx-auto flex items-center gap-1.5 text-foreground/50 text-xs">
          <span className="size-1.5 rounded-full bg-primary" />
          Community-run unofficial directory
        </div>
        <h1 className="font-semibold text-4xl tracking-tight">
          A directory of paseo.sh plugins
        </h1>
        <p className="mx-auto max-w-xl text-foreground/70">
          Browse community-built{" "}
          <a href="https://paseo.sh" className="underline underline-offset-4">
            Paseo
          </a>{" "}
          plugins. Every listing is generated straight from each plugin's own
          repo — no forms to fill out, just point us at the code.
        </p>
      </div>

      <p className="text-foreground/60 text-sm">
        {query || category
          ? `${filtered.length} of ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} found.`
          : `${plugins.length} plugin${plugins.length === 1 ? "" : "s"} generated from their source repos.`}
      </p>
      <div className="mx-auto flex w-full flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-foreground/50 text-sm">
              No plugins match your filters.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((plugin) => (
                <PluginCard key={plugin.id} plugin={plugin} />
              ))}
            </div>
          )}
        </div>
        <aside className="flex flex-col gap-3 bg-card p-3 lg:sticky lg:top-20 lg:w-64 lg:shrink-0 lg:self-start">
          <div className="relative">
            <InputGroup>
              <InputGroupAddon align={"inline-start"}>
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search plugins…"
              />
            </InputGroup>
          </div>

          <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
            Sort by
          </span>
          <div className="flex flex-wrap gap-1">
            {SORT_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size={"sm"}
                onClick={() => setSort(option.value)}
                className="h-auto w-fit text-sm!"
                variant={sort === option.value ? "default" : "outline"}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
            Categories
          </span>
          <div className="flex flex-wrap gap-1">
            <Button
              size={"sm"}
              onClick={() => setCategory(null)}
              className="h-auto w-fit text-sm!"
              variant={category === null ? "default" : "outline"}
            >
              All
              <span className="text-xs! opacity-70">{plugins.length}</span>
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                size={"sm"}
                onClick={() => setCategory(c)}
                className="h-auto w-fit text-sm!"
                variant={category === c ? "default" : "outline"}
              >
                {c}
                <span className="text-xs! opacity-70">
                  {categoryCounts.get(c)}
                </span>
              </Button>
            ))}
          </div>

          <Button
            nativeButton={false}
            variant="outline"
            className="w-full"
            render={<Link to="/submit" />}
          >
            Submit your plugin
          </Button>
        </aside>
      </div>
    </div>
  )
}
