import { IconSearch } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { SORT_OPTIONS, type SortOption } from "@/lib/sort-plugins"

interface PluginSidebarProps {
  query: string
  onQueryChange: (query: string) => void
  sort: SortOption
  onSortChange: (sort: SortOption) => void
  category: string | null
  onCategoryChange: (category: string | null) => void
  categories: string[]
  categoryCounts: Map<string, number>
  totalCount: number
}

/** Homepage search box, sort, category filters, and the "Submit your plugin" CTA. */
export function PluginSidebar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  category,
  onCategoryChange,
  categories,
  categoryCounts,
  totalCount,
}: PluginSidebarProps) {
  return (
    <aside className="flex flex-col gap-3 bg-card p-3 lg:sticky lg:top-20 lg:w-64 lg:shrink-0 lg:self-start">
      <div className="relative">
        <InputGroup>
          <InputGroupAddon align={"inline-start"}>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search plugins…"
            aria-label="Search plugins"
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
            onClick={() => onSortChange(option.value)}
            className="h-auto w-fit text-sm!"
            variant={sort === option.value ? "default" : "outline"}
            aria-pressed={sort === option.value}
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
          onClick={() => onCategoryChange(null)}
          className="h-auto w-fit text-sm!"
          variant={category === null ? "default" : "outline"}
          aria-pressed={category === null}
        >
          All
          <span className="text-xs! opacity-70">{totalCount}</span>
        </Button>
        {categories.map((c) => (
          <Button
            key={c}
            size={"sm"}
            onClick={() => onCategoryChange(c)}
            className="h-auto w-fit text-sm!"
            variant={category === c ? "default" : "outline"}
            aria-pressed={category === c}
          >
            {c}
            <span className="text-xs! opacity-70">{categoryCounts.get(c)}</span>
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
