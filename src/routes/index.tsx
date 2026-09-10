import { IconSearch } from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import { z } from "zod"
import { PluginCard } from "@/components/plugin-card"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import type { PluginRecord } from "@/lib/plugin-schema"
import { listPlugins } from "@/lib/plugins-data"
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  normalizeCategory,
} from "@/lib/registry-schema"
import { seo } from "@/lib/seo"
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site"

const sortValues = ["popular", "updated", "az"] as const
type SortValue = (typeof sortValues)[number]
const searchSchema = z.object({
  q: z.string().catch(""),
  category: z
    .string()
    .catch("")
    .transform((category) =>
      category.trim() ? normalizeCategory(category) : ""
    ),
  sort: z.enum(sortValues).catch("popular"),
  page: z.coerce
    .number()
    .int()
    .positive()
    .catch(1)
    .optional()
    .transform((page) => page ?? 1),
})

type CatalogSearch = Omit<z.output<typeof searchSchema>, "page"> & {
  page?: number
}

function validateSearch(search: unknown): CatalogSearch {
  return searchSchema.parse(search)
}

const SECTION_LIMIT = 6
const PAGE_SIZE = 12
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export const Route = createFileRoute("/")({
  validateSearch,
  head: () =>
    seo({ title: SITE_NAME, description: SITE_DESCRIPTION, path: "/" }),
  component: App,
  loader: () => listPlugins(),
})

function App() {
  const plugins = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      CATEGORIES.map((category) => [category, 0])
    ) as Record<Category, number>

    for (const plugin of plugins) {
      const pluginCategories = new Set(plugin.categories.map(normalizeCategory))
      for (const category of pluginCategories) counts[category] += 1
    }

    return counts
  }, [plugins])

  const categories = CATEGORIES.filter(
    (category) => categoryCounts[category] > 0
  )
  const query = search.q.trim()
  const hasFilters = query.length > 0 || search.category.length > 0

  const filtered = useMemo(() => {
    if (!query && !search.category) return plugins

    return plugins.filter((plugin) => {
      if (
        search.category &&
        !plugin.categories.some(
          (category) => normalizeCategory(category) === search.category
        )
      )
        return false
      if (!query) return true
      return matchesPluginQuery(plugin, query)
    })
  }, [plugins, query, search.category])

  const sorted = useMemo(
    () => sortPlugins(filtered, search.sort),
    [filtered, search.sort]
  )
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const requestedPage = search.page ?? 1
  const page = Math.min(requestedPage, totalPages)
  const pageStart = (page - 1) * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sorted.length)
  const pagePlugins = useMemo(
    () => sorted.slice(pageStart, pageStart + PAGE_SIZE),
    [pageStart, sorted]
  )

  useEffect(() => {
    if (requestedPage === page) return
    navigate({
      search: (previous) => ({ ...previous, page }),
      replace: true,
    })
  }, [navigate, page, requestedPage])

  const popular = useMemo(
    () => sortPlugins(plugins, "popular").slice(0, SECTION_LIMIT),
    [plugins]
  )
  const recentlyUpdated = useMemo(
    () => sortPlugins(plugins, "updated").slice(0, SECTION_LIMIT),
    [plugins]
  )
  const showFeatured = !hasFilters && search.sort === "popular" && page === 1

  const summary = hasFilters
    ? `${filtered.length} of ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} found.`
    : `${plugins.length} plugin${plugins.length === 1 ? "" : "s"} generated from their source repos.`

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
          plugins. Every listing is generated straight from each plugin&apos;s
          own repo — no forms to fill out, just point us at the code.
        </p>
      </div>

      <p className="text-foreground/60 text-sm">{summary}</p>

      <div className="mx-auto flex w-full flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {showFeatured ? (
            <div className="flex flex-col gap-8">
              <FeaturedSection
                title="Popular"
                description="Most starred plugins right now."
                plugins={popular}
              />
              <FeaturedSection
                title="Recently updated"
                description="Plugins with recent repository activity."
                plugins={recentlyUpdated}
              />
            </div>
          ) : null}

          {sorted.length === 0 ? (
            <p className="py-12 text-center text-foreground/50 text-sm">
              No plugins match your filters.
            </p>
          ) : (
            <section
              className="mt-8 flex flex-col gap-3"
              aria-labelledby="all-results-heading"
            >
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h2
                    id="all-results-heading"
                    className="font-medium text-lg tracking-tight"
                  >
                    All plugins
                  </h2>
                  <p className="text-foreground/50 text-sm">
                    Sorted by {sortLabels[search.sort]}.
                  </p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {pagePlugins.map((plugin) => (
                  <PluginCard key={plugin.id} plugin={plugin} />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-foreground/50 text-sm" aria-live="polite">
                  Showing {pageStart + 1}–{pageEnd} of {sorted.length} · Page{" "}
                  {page} of {totalPages}
                </p>
                <nav className="flex gap-2" aria-label="Catalog pagination">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page === 1}
                    onClick={() =>
                      navigate({
                        search: (previous) => ({
                          ...previous,
                          page: page - 1,
                        }),
                      })
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={page === totalPages}
                    onClick={() =>
                      navigate({
                        search: (previous) => ({
                          ...previous,
                          page: page + 1,
                        }),
                      })
                    }
                  >
                    Next
                  </Button>
                </nav>
              </div>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-3 bg-card p-3 lg:sticky lg:top-20 lg:w-64 lg:shrink-0 lg:self-start">
          <div className="relative">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <IconSearch />
              </InputGroupAddon>
              <InputGroupInput
                value={search.q}
                onChange={(e) => {
                  const q = e.target.value
                  navigate({
                    search: (prev) => ({ ...prev, q, page: 1 }),
                    replace: true,
                  })
                }}
                placeholder="Search name, repo, owner…"
                aria-label="Search plugins"
              />
            </InputGroup>
          </div>

          <div className="flex flex-col gap-2">
            <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
              Sort
            </span>
            <div className="flex flex-wrap gap-1">
              {sortOptions.map((option) => (
                <Button
                  key={option}
                  size="sm"
                  onClick={() =>
                    navigate({
                      search: (prev) => ({ ...prev, sort: option, page: 1 }),
                    })
                  }
                  aria-pressed={search.sort === option}
                  className="h-auto w-fit text-sm!"
                  variant={search.sort === option ? "default" : "outline"}
                >
                  {sortLabels[option]}
                </Button>
              ))}
            </div>
          </div>

          <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
            Categories
          </span>
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              onClick={() =>
                navigate({
                  search: (prev) => ({ ...prev, category: "", page: 1 }),
                })
              }
              aria-pressed={search.category === ""}
              className="h-auto w-fit text-sm!"
              variant={search.category === "" ? "default" : "outline"}
            >
              All
              <span className="text-xs! opacity-70">{plugins.length}</span>
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                size="sm"
                onClick={() =>
                  navigate({
                    search: (prev) => ({ ...prev, category: c, page: 1 }),
                  })
                }
                aria-pressed={search.category === c}
                className="h-auto w-fit text-sm!"
                variant={search.category === c ? "default" : "outline"}
              >
                {CATEGORY_LABELS[c]}
                <span className="text-xs! opacity-70">{categoryCounts[c]}</span>
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

function FeaturedSection({
  title,
  description,
  plugins,
}: {
  title: string
  description: string
  plugins: PluginRecord[]
}) {
  if (plugins.length === 0) return null

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
    >
      <div>
        <h2
          id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
          className="font-medium text-lg tracking-tight"
        >
          {title}
        </h2>
        <p className="text-foreground/50 text-sm">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plugins.map((plugin) => (
          <PluginCard key={plugin.id} plugin={plugin} />
        ))}
      </div>
    </section>
  )
}

function sortPlugins(plugins: PluginRecord[], sort: SortValue): PluginRecord[] {
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
      case "az":
        return comparePluginsByName(a, b)
      default:
        return 0
    }
  })
}

function comparePluginsByName(a: PluginRecord, b: PluginRecord): number {
  return collator.compare(a.name, b.name) || collator.compare(a.id, b.id)
}

function matchesPluginQuery(plugin: PluginRecord, query: string): boolean {
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

const sortLabels: Record<SortValue, string> = {
  popular: "Popular",
  updated: "Recently updated",
  az: "A–Z",
}

const sortOptions: SortValue[] = ["popular", "updated", "az"]
