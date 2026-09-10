import { PluginCard } from "@/components/plugin-card"
import type { PluginRecord } from "@/lib/plugin-schema"

/** The filtered/sorted results area on the homepage — a card grid, or an empty state when nothing matches. */
export function PluginGrid({ plugins }: { plugins: PluginRecord[] }) {
  if (plugins.length === 0) {
    return (
      <p className="py-12 text-center text-foreground/50 text-sm">
        No plugins match your filters.
      </p>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard key={plugin.id} plugin={plugin} />
      ))}
    </div>
  )
}
