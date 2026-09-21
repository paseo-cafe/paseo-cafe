import { Link } from "@tanstack/react-router"
import { PluginGrid } from "@/components/plugin-grid"
import { SectionHeader } from "@/components/section-header"
import { Button } from "@/components/ui/button"
import type { CatalogSearch } from "@/lib/catalog-search"
import { sortLabels } from "@/lib/catalog-search"
import type { PluginRecord } from "@/lib/plugin-schema"

/** Pagination links land here so the next page starts at its first result. */
const RESULTS_HEADING_ID = "all-results-heading"

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
    return <p className="empty-state">No plugins match your filters.</p>
  }

  return (
    <section
      className="flex flex-col gap-base"
      aria-labelledby={RESULTS_HEADING_ID}
    >
      <SectionHeader
        id={RESULTS_HEADING_ID}
        title="All plugins"
        description={`Sorted by ${sortLabels[search.sort]}.`}
      />
      <PluginGrid plugins={plugins} showAddedDate={search.sort === "added"} />
      <div className="flex flex-wrap items-center justify-between gap-stack">
        <p className="type-body text-muted-foreground" aria-live="polite">
          Showing {pageStart + 1}–{pageEnd} of {totalCount} · Page {page} of{" "}
          {totalPages}
        </p>
        <nav className="flex gap-group" aria-label="Catalog pagination">
          {page === 1 ? (
            <Button type="button" variant="outline" disabled>
              Previous
            </Button>
          ) : (
            <Button
              nativeButton={false}
              variant="outline"
              render={
                <Link
                  to="/"
                  search={{ ...search, page: page - 1 }}
                  hash={RESULTS_HEADING_ID}
                />
              }
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
              render={
                <Link
                  to="/"
                  search={{ ...search, page: page + 1 }}
                  hash={RESULTS_HEADING_ID}
                />
              }
            >
              Next
            </Button>
          )}
        </nav>
      </div>
    </section>
  )
}
