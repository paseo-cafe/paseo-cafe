import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { CatalogResults } from "@/components/catalog-results";
import { CatalogSidebar } from "@/components/catalog-sidebar";
import { FeaturedSection } from "@/components/featured-section";
import { InstallCallout } from "@/components/install-callout";
import { ThemeFeaturedSection } from "@/components/theme-featured-section";
import { useScrollAnchor } from "@/hooks/use-scroll-anchor";
import {
  type CatalogSearch,
  clampCatalogPage,
  matchesPluginQuery,
  parseCatalogSearch,
  routeSearchSchema,
  sortPlugins,
} from "@/lib/catalog-search";
import { listPlugins } from "@/lib/plugins-data";
import {
  CATEGORIES,
  type Category,
  normalizeCategory,
  PLATFORMS,
  type Platform,
} from "@/lib/registry-schema";
import { seo } from "@/lib/seo";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { isCatalogRecencyKnown } from "../../plugin/shared/catalog";

const SECTION_LIMIT = 6;
const PAGE_SIZE = 12;

export const Route = createFileRoute("/")({
  validateSearch: routeSearchSchema,
  head: () => {
    const metadata = seo({
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      path: "/",
    });
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
    };
  },
  component: App,
  loader: () => listPlugins(),
});

function App() {
  const plugins = Route.useLoaderData();
  const search = parseCatalogSearch(Route.useSearch());
  const navigate = Route.useNavigate();

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(
      CATEGORIES.map((category) => [category, 0]),
    ) as Record<Category, number>;

    for (const plugin of plugins) {
      const pluginCategories = new Set(
        plugin.categories.map(normalizeCategory),
      );
      for (const category of pluginCategories) counts[category] += 1;
    }

    return counts;
  }, [plugins]);

  const categories = CATEGORIES.filter(
    (category) => categoryCounts[category] > 0,
  );

  const platformCounts = useMemo(() => {
    const counts = Object.fromEntries(
      PLATFORMS.map((platform) => [platform, 0]),
    ) as Record<Platform, number>;
    let unrestricted = 0;

    for (const plugin of plugins) {
      if (plugin.platforms.length === 0) {
        unrestricted += 1;
        continue;
      }
      for (const platform of new Set(plugin.platforms)) counts[platform] += 1;
    }

    // Omitted `platforms` means "runs anywhere" (see registry-schema.ts), so
    // an unrestricted plugin counts toward every platform's total — matching
    // what the filter below actually returns for that platform.
    for (const platform of PLATFORMS) counts[platform] += unrestricted;

    return counts;
  }, [plugins]);

  const platformsWithResults = PLATFORMS.filter(
    (platform) => platformCounts[platform] > 0,
  );

  const paseoCafePlugin = useMemo(
    () => plugins.find((p) => p.id === "paseo-cafe"),
    [plugins],
  );

  const query = search.q.trim();
  const hasFilters =
    query.length > 0 ||
    search.category.length > 0 ||
    search.platform.length > 0;

  const filtered = useMemo(() => {
    if (!query && !search.category && !search.platform) return plugins;

    return plugins.filter((plugin) => {
      if (
        search.category &&
        !plugin.categories.some(
          (category) => normalizeCategory(category) === search.category,
        )
      )
        return false;
      if (
        search.platform &&
        plugin.platforms.length > 0 &&
        !plugin.platforms.includes(search.platform)
      )
        return false;
      if (!query) return true;
      return matchesPluginQuery(plugin, query);
    });
  }, [plugins, query, search.category, search.platform]);

  const sorted = useMemo(
    () => sortPlugins(filtered, search.sort),
    [filtered, search.sort],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const requestedPage = search.page;
  const page = clampCatalogPage(requestedPage, totalPages);
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, sorted.length);
  const pagePlugins = useMemo(
    () => sorted.slice(pageStart, pageStart + PAGE_SIZE),
    [pageStart, sorted],
  );

  useEffect(() => {
    if (requestedPage === page) return;
    navigate({
      search: (previous) => ({ ...previous, page }),
      replace: true,
      resetScroll: false,
    });
  }, [navigate, page, requestedPage]);

  // Filters apply in place. The router's default is to scroll to the top after
  // every navigation, which yanks the page out from under the sidebar; instead
  // hold the results list where the reader is looking while the sections above
  // it appear or disappear.
  const { anchorRef: resultsRef, capture: holdResultsPosition } =
    useScrollAnchor<HTMLDivElement>(
      `${search.q}|${search.category}|${search.platform}|${search.sort}|${search.page}`,
    );
  const applyFilters = (
    patch: Partial<Omit<CatalogSearch, "page">>,
    replace = false,
  ) => {
    holdResultsPosition();
    navigate({
      search: (prev) => ({ ...prev, ...patch, page: 1 }),
      replace,
      resetScroll: false,
    });
  };

  const themePlugins = useMemo(
    () =>
      sortPlugins(
        plugins.filter((plugin) =>
          plugin.categories.some(
            (category) => normalizeCategory(category) === "theme",
          ),
        ),
        "popular",
      ),
    [plugins],
  );
  const popular = useMemo(
    () => sortPlugins(plugins, "popular").slice(0, SECTION_LIMIT),
    [plugins],
  );
  // npm entries use their exact version publication date; Git-only entries
  // retain their catalog-listing date. Unknown dates never enter this section.
  const recentlyAdded = useMemo(
    () =>
      sortPlugins(plugins.filter(isCatalogRecencyKnown), "added").slice(
        0,
        SECTION_LIMIT,
      ),
    [plugins],
  );
  const showFeatured = !hasFilters && search.sort === "popular" && page === 1;

  const summary = hasFilters
    ? `${filtered.length} of ${plugins.length} plugin${plugins.length === 1 ? "" : "s"} found.`
    : `${plugins.length} plugin${plugins.length === 1 ? "" : "s"} generated from their source repos.`;

  return (
    <div className="page-body">
      <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-base text-center">
        <div className="type-meta mx-auto flex items-center gap-chip text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Community-run unofficial directory
        </div>
        <h1 className="type-display">A directory of paseo.sh plugins</h1>
        <p className="type-lead mx-auto max-w-xl text-muted-foreground">
          Browse community-built{" "}
          <a href="https://paseo.sh" className="underline underline-offset-4">
            Paseo
          </a>{" "}
          plugins. Every listing is generated straight from each plugin&apos;s
          own repo — no forms to fill out, just point us at the code.
        </p>
        {paseoCafePlugin ? <InstallCallout plugin={paseoCafePlugin} /> : null}
      </div>

      <div className="flex flex-col gap-section lg:flex-row lg:items-start">
        <CatalogSidebar
          search={search}
          totalCount={plugins.length}
          categories={categories}
          categoryCounts={categoryCounts}
          platforms={platformsWithResults}
          platformCounts={platformCounts}
          onQueryChange={(q) => applyFilters({ q }, true)}
          onSortChange={(sort) => applyFilters({ sort })}
          onCategoryChange={(category) => applyFilters({ category })}
          onPlatformChange={(platform) => applyFilters({ platform })}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-section">
          {/* Everything that changes with the filters lives in this column, so
              nothing above the sidebar row moves when a filter is clicked. */}
          <div className="flex flex-col gap-stack">
            <p className="type-body text-muted-foreground">{summary}</p>
            {search.category === "theme" ? (
              <p className="surface-panel type-body px-stack py-group">
                Want to compare the palettes themselves?{" "}
                <Link to="/themes" className="underline underline-offset-4">
                  Open the Themes gallery.
                </Link>
              </p>
            ) : null}
          </div>

          {showFeatured ? (
            <>
              <ThemeFeaturedSection plugins={themePlugins} />
              <FeaturedSection
                title="Popular"
                description="Most downloaded npm plugins, followed by starred Git plugins."
                plugins={popular}
              />
              <FeaturedSection
                title="Recent"
                description="Latest npm releases, followed by newest Git listings."
                plugins={recentlyAdded}
              />
            </>
          ) : null}

          <div ref={resultsRef}>
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
    </div>
  );
}
