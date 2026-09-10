import { IconSearch } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
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
    <aside className="flex flex-col gap-3 bg-card p-3 lg:sticky lg:top-20 lg:order-last lg:w-1/3 lg:shrink-0 lg:self-start">
      <div className="relative">
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
              onClick={() => onSortChange(option)}
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
          onClick={() => onCategoryChange("")}
          aria-pressed={search.category === ""}
          className="h-auto w-fit text-sm!"
          variant={search.category === "" ? "default" : "outline"}
        >
          All
          <span className="text-xs! opacity-70">{totalCount}</span>
        </Button>
        {categories.map((c) => (
          <Button
            key={c}
            size="sm"
            onClick={() => onCategoryChange(c)}
            aria-pressed={search.category === c}
            className="h-auto w-fit text-sm!"
            variant={search.category === c ? "default" : "outline"}
          >
            {CATEGORY_LABELS[c]}
            <span className="text-xs! opacity-70">{categoryCounts[c]}</span>
          </Button>
        ))}
      </div>

      <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
        Platform
      </span>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          onClick={() => onPlatformChange("")}
          aria-pressed={search.platform === ""}
          className="h-auto w-fit text-sm!"
          variant={search.platform === "" ? "default" : "outline"}
        >
          All
        </Button>
        {platforms.map((p) => (
          <Button
            key={p}
            size="sm"
            onClick={() => onPlatformChange(p)}
            aria-pressed={search.platform === p}
            className="h-auto w-fit text-sm!"
            variant={search.platform === p ? "default" : "outline"}
          >
            {PLATFORM_LABELS[p]}
            <span className="text-xs! opacity-70">{platformCounts[p]}</span>
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
  )
}
