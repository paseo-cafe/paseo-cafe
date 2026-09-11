import { PluginCard } from "@/components/plugin-card"
import type { PluginRecord } from "@/lib/plugin-schema"
import type { CatalogDateField } from "../../plugin/shared/catalog"

export function PluginGrid({
  plugins,
  dateField,
}: {
  plugins: PluginRecord[]
  dateField?: CatalogDateField
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {plugins.map((plugin) => (
        <PluginCard key={plugin.id} plugin={plugin} dateField={dateField} />
      ))}
    </div>
  )
}
