import { PluginCard } from "@/components/plugin-card"
import type { PluginRecord } from "@/lib/plugin-schema"

export function PluginGrid({
  plugins,
  showAddedDate,
}: {
  plugins: PluginRecord[]
  showAddedDate?: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          showAddedDate={showAddedDate}
        />
      ))}
    </div>
  )
}
