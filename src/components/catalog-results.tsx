import { Link } from "@tanstack/react-router"
import { PluginGrid } from "@/components/plugin-grid"
import { Button } from "@/components/ui/button"
import type { CatalogSearch } from "@/lib/catalog-search"
import { sortLabels } from "@/lib/catalog-search"
import type { PluginRecord } from "@/lib/plugin-schema"

interface CatalogResultsProps {
  plugins: PluginRecord[]
  search: CatalogSearch
  page: number
  totalPages: number
  pageStart: number
  pageEnd: number
  totalCount: number
}

export function CatalogResults({
  plugins,
  search,
  page,
  totalPages,
  pageStart,
  pageEnd,
  totalCount,
}: CatalogResultsProps) {
  if (totalCount === 0) {
    return (
      <p className="py-12 text-center text-foreground/50 text-sm">
        No plugins match your filters.
      </p>
    )
  }

  return (
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
      <PluginGrid plugins={plugins} showAddedDate={search.sort === "added"} />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <p className="text-foreground/50 text-sm" aria-live="polite">
          Showing {pageStart + 1}–{pageEnd} of {totalCount} · Page {page} of{" "}
          {totalPages}
        </p>
        <nav className="flex gap-2" aria-label="Catalog pagination">
          {page === 1 ? (
            <Button type="button" variant="outline" disabled>
              Previous
            </Button>
          ) : (
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link to="/" search={{ ...search, page: page - 1 }} />}
            >
              Previous
            </Button>
          )}
          {page === totalPages ? (
            <Button type="button" variant="outline" disabled>
              Next
            </Button>
          ) : (
            <Button
              nativeButton={false}
              variant="outline"
              render={<Link to="/" search={{ ...search, page: page + 1 }} />}
            >
              Next
            </Button>
          )}
        </nav>
      </div>
    </section>
  )
}
