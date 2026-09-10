import { IconRefresh, IconSearch, IconSparkles } from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { type ReactNode, useMemo, useState } from "react"
import { PluginCard } from "@/components/plugin-card"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useLastVisit } from "@/hooks/use-last-visit"
import { listPlugins } from "@/lib/plugins-data"
import { seo } from "@/lib/seo"
import { selectAddedSince, selectUpdatedSince } from "@/lib/since-last-visit"
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site"
import {
  SORT_KEYS,
  SORT_LABELS,
  type SortKey,
  sortPlugins,
} from "@/lib/sort-plugins"

export const Route = createFileRoute("/")({
  head: () =>
    seo({ title: SITE_NAME, description: SITE_DESCRIPTION, path: "/" }),
  component: App,
  loader: () => listPlugins(),
})

/** One of the "since your last visit" filters — same shape for both, so they stay visually identical. */
function RecencyButton({
  active,
  count,
  icon,
  label,
  onClick,
}: {
  active: boolean
  count: number
  icon: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <Button
      size={"sm"}
      onClick={onClick}
      aria-pressed={active}
      // whitespace-normal: buttons are nowrap by default, which would push a
      // label plus its count straight out of the sidebar instead of wrapping.
      className="h-auto w-full justify-start whitespace-normal py-1 text-sm!"
      variant={active ? "default" : "outline"}
    >
      {icon}
      {label}
      <span className="text-xs! opacity-70">{count}</span>
    </Button>
  )
}

function App() {
  const plugins = Route.useLoaderData()
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  // Which "since your last visit" set the grid is narrowed to, if any. One at
  // a time: the two sets don't overlap, so combining them would only ever mean
  // "or", which the category filter above doesn't do either.
  const [recency, setRecency] = useState<"new" | "updated" | null>(null)
  const [sort, setSort] = useState<SortKey>("name")
  const { lastVisit, ready } = useLastVisit()

  // What the directory gained and what changed version since this browser's
  // previous visit. Both empty until the storage read lands, so the prerendered
  // markup hydrates cleanly.
  const newIds = useMemo(
    () => new Set(selectAddedSince(plugins, lastVisit).map((p) => p.id)),
    [plugins, lastVisit]
  )
  const updatedIds = useMemo(
    () => new Set(selectUpdatedSince(plugins, lastVisit).map((p) => p.id)),
    [plugins, lastVisit]
  )

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
      if (recency === "new" && !newIds.has(plugin.id)) return false
      if (recency === "updated" && !updatedIds.has(plugin.id)) return false
      if (category && !plugin.categories.includes(category)) return false
      if (!q) return true
      return (
        plugin.name.toLowerCase().includes(q) ||
        plugin.description.toLowerCase().includes(q) ||
        plugin.id.toLowerCase().includes(q)
      )
    })
    return sortPlugins(matches, sort)
  }, [plugins, query, category, recency, newIds, updatedIds, sort])

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
        {query || category || recency
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
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  isNew={newIds.has(plugin.id)}
                  isUpdated={updatedIds.has(plugin.id)}
                />
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
            {SORT_KEYS.map((key) => (
              <Button
                key={key}
                size={"sm"}
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className="h-auto w-fit text-sm!"
                variant={sort === key ? "default" : "outline"}
              >
                {SORT_LABELS[key]}
              </Button>
            ))}
          </div>

          {ready && (newIds.size > 0 || updatedIds.size > 0) ? (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
                Since your last visit
              </span>
              {newIds.size > 0 ? (
                <RecencyButton
                  active={recency === "new"}
                  count={newIds.size}
                  icon={<IconSparkles />}
                  label="New plugins"
                  onClick={() =>
                    setRecency((value) => (value === "new" ? null : "new"))
                  }
                />
              ) : null}
              {updatedIds.size > 0 ? (
                <RecencyButton
                  active={recency === "updated"}
                  count={updatedIds.size}
                  icon={<IconRefresh />}
                  label="New versions"
                  onClick={() =>
                    setRecency((value) =>
                      value === "updated" ? null : "updated"
                    )
                  }
                />
              ) : null}
            </div>
          ) : null}

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
