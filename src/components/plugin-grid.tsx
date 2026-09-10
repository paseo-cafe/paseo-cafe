import { PluginCard } from "@/components/plugin-card"
import type { PluginRecord } from "@/lib/plugin-schema"

export function PluginGrid({ plugins }: { plugins: PluginRecord[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard key={plugin.id} plugin={plugin} />
      ))}
    </div>
  )
}
