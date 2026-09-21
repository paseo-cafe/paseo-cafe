import { IconSearch } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import type { CatalogSearch, SortValue } from "@/lib/catalog-search"
import { sortLabels, sortOptions } from "@/lib/catalog-search"
import type { Category, Platform } from "@/lib/registry-schema"
import { CATEGORY_LABELS, PLATFORM_LABELS } from "@/lib/registry-schema"

interface CatalogSidebarProps {
  search: CatalogSearch
  totalCount: number
  categories: Category[]
  categoryCounts: Record<Category, number>
  platforms: Platform[]
  platformCounts: Record<Platform, number>
  onQueryChange: (q: string) => void
  onSortChange: (sort: SortValue) => void
  onCategoryChange: (category: Category | "") => void
  onPlatformChange: (platform: Platform | "") => void
}

/** A labelled group of filter chips; every group in the sidebar is built this way. */
function FilterGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-group">
      <span className="type-eyebrow text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-chip">{children}</div>
    </div>
  )
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean
  count?: number
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
      {count === undefined ? null : <span className="opacity-70">{count}</span>}
    </Button>
  )
}

export function CatalogSidebar({
  search,
  totalCount,
  categories,
  categoryCounts,
  platforms,
  platformCounts,
  onQueryChange,
  onSortChange,
  onCategoryChange,
  onPlatformChange,
}: CatalogSidebarProps) {
  return (
    <aside className="sidebar-column lg:order-last">
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          value={search.q}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search name, repo, owner…"
          aria-label="Search plugins"
        />
      </InputGroup>

      <FilterGroup label="Sort">
        {sortOptions.map((option) => (
          <FilterChip
            key={option}
            active={search.sort === option}
            onClick={() => onSortChange(option)}
          >
            {sortLabels[option]}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Categories">
        <FilterChip
          active={search.category === ""}
          count={totalCount}
          onClick={() => onCategoryChange("")}
        >
          All
        </FilterChip>
        {categories.map((c) => (
          <FilterChip
            key={c}
            active={search.category === c}
            count={categoryCounts[c]}
            onClick={() => onCategoryChange(c)}
          >
            {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
      </FilterGroup>

      <FilterGroup label="Platform">
        <FilterChip
          active={search.platform === ""}
          count={totalCount}
          onClick={() => onPlatformChange("")}
        >
          All
        </FilterChip>
        {platforms.map((p) => (
          <FilterChip
            key={p}
            active={search.platform === p}
            count={platformCounts[p]}
            onClick={() => onPlatformChange(p)}
          >
            {PLATFORM_LABELS[p]}
          </FilterChip>
        ))}
      </FilterGroup>

      <Button
        nativeButton={false}
        variant="outline"
        className="w-full"
        render={<Link to="/submit" />}
      >
        Submit your plugin
      </Button>
    </aside>
  )
}
