import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo } from "react"
import { CatalogResults } from "@/components/catalog-results"
import { CatalogSidebar } from "@/components/catalog-sidebar"
import { FeaturedSection } from "@/components/featured-section"
import { InstallCallout } from "@/components/install-callout"
import {
  clampCatalogPage,
  matchesPluginQuery,
  parseCatalogSearch,
  routeSearchSchema,
  sortPlugins,
} from "@/lib/catalog-search"
import { listPlugins } from "@/lib/plugins-data"
import {
  CATEGORIES,
  type Category,
  normalizeCategory,
  PLATFORMS,
  type Platform,
} from "@/lib/registry-schema"
import { seo } from "@/lib/seo"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site"

const SECTION_LIMIT = 6
const PAGE_SIZE = 12

export const Route = createFileRoute("/")({
  validateSearch: routeSearchSchema,
  head: () => {
    const metadata = seo({
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      path: "/",
    })
    return {
      ...metadata,
      links: [
        ...metadata.links,
        {
          rel: "alternate",
          type: "text/plain",
          href: `${SITE_URL}/llms.txt`,
          title: "LLM-readable catalog index",
        },
        {
          rel: "service-desc",
          type: "application/vnd.oai.openapi+json",
          href: `${SITE_URL}/openapi.json`,
          title: "Catalog OpenAPI document",
        },
      ],
    }
  },
  component: App,
  loader: () => listPlugins(),
})

function App() {
  const plugins = Route.useLoaderData()
  const search = parseCatalogSearch(Route.useSearch())
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

  const platformCounts = useMemo(() => {
    const counts = Object.fromEntries(
      PLATFORMS.map((platform) => [platform, 0])
    ) as Record<Platform, number>
    let unrestricted = 0

    for (const plugin of plugins) {
      if (plugin.platforms.length === 0) {
        unrestricted += 1
        continue
      }
      for (const platform of new Set(plugin.platforms)) counts[platform] += 1
    }

    // Omitted `platforms` means "runs anywhere" (see registry-schema.ts), so
    // an unrestricted plugin counts toward every platform's total — matching
    // what the filter below actually returns for that platform.
    for (const platform of PLATFORMS) counts[platform] += unrestricted

    return counts
  }, [plugins])

  const platformsWithResults = PLATFORMS.filter(
    (platform) => platformCounts[platform] > 0
  )

  const paseoCafePlugin = useMemo(
    () => plugins.find((p) => p.id === "paseo-cafe"),
    [plugins]
  )

  const query = search.q.trim()
  const hasFilters =
    query.length > 0 || search.category.length > 0 || search.platform.length > 0

  const filtered = useMemo(() => {
    if (!query && !search.category && !search.platform) return plugins

    return plugins.filter((plugin) => {
      if (
        search.category &&
        !plugin.categories.some(
          (category) => normalizeCategory(category) === search.category
        )
      )
        return false
      if (
        search.platform &&
        plugin.platforms.length > 0 &&
        !plugin.platforms.includes(search.platform)
      )
        return false
      if (!query) return true
      return matchesPluginQuery(plugin, query)
    })
  }, [plugins, query, search.category, search.platform])

  const sorted = useMemo(
    () => sortPlugins(filtered, search.sort),
    [filtered, search.sort]
  )
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const requestedPage = search.page
  const page = clampCatalogPage(requestedPage, totalPages)
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
  // Only plugins with a known listing date: without git history to derive it
  // from (see readRegistryAddedAt in scripts/scan.ts) this section stays
  // empty rather than presenting an arbitrary order as "newest".
  const recentlyAdded = useMemo(
    () =>
      sortPlugins(
        plugins.filter((plugin) => plugin.addedAt),
        "added"
      ).slice(0, SECTION_LIMIT),
    [plugins]
  )
  const showFeatured = !hasFilters && search.sort === "popular" && page === 1

  const summary = hasFilters
    ? `${filtered.length} of ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} found.`
    : `${plugins.length} plugin${plugins.length === 1 ? "" : "s"} generated from their source repos.`

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 pb-20 sm:px-6">
      <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-4 px-0 pt-16 pb-2 text-center sm:px-6">
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
        {paseoCafePlugin ? <InstallCallout plugin={paseoCafePlugin} /> : null}
      </div>

      <p className="text-foreground/60 text-sm">{summary}</p>
      <div className="mx-auto flex w-full flex-col gap-8 lg:flex-row lg:items-start">
        <CatalogSidebar
          search={search}
          totalCount={plugins.length}
          categories={categories}
          categoryCounts={categoryCounts}
          platforms={platformsWithResults}
          platformCounts={platformCounts}
          onQueryChange={(q) =>
            navigate({
              search: (prev) => ({ ...prev, q, page: 1 }),
              replace: true,
            })
          }
          onSortChange={(sort) =>
            navigate({ search: (prev) => ({ ...prev, sort, page: 1 }) })
          }
          onCategoryChange={(category) =>
            navigate({ search: (prev) => ({ ...prev, category, page: 1 }) })
          }
          onPlatformChange={(platform) =>
            navigate({ search: (prev) => ({ ...prev, platform, page: 1 }) })
          }
        />
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
              <FeaturedSection
                title="Recently added"
                description="The newest listings in the directory."
                plugins={recentlyAdded}
              />
            </div>
          ) : null}

          <CatalogResults
            plugins={pagePlugins}
            search={search}
            page={page}
            totalPages={totalPages}
            pageStart={pageStart}
            pageEnd={pageEnd}
            totalCount={sorted.length}
          />
        </div>
      </div>
    </div>
  )
}
