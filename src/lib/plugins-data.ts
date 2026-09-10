import { z } from "zod"
import type { PluginRecord } from "@/lib/plugin-schema"
import { pluginOwnerLogin, pluginRecordSchema } from "@/lib/plugin-schema"
import plugins from "../../data/plugins.json"

// The registry scan validates every record before writing this build-time
// snapshot. Parse once when the module loads so route loaders and the static
// API use the same immutable catalog without requiring a server function.
const catalog = z.array(pluginRecordSchema).parse(plugins)
const pluginsById = Object.fromEntries(
  catalog.map((plugin) => [plugin.id, plugin])
) as Record<string, PluginRecord>

export function listPlugins(): PluginRecord[] {
  return catalog
}

export function getPlugin(id: string): PluginRecord | undefined {
  return Object.hasOwn(pluginsById, id) ? pluginsById[id] : undefined
}

export function listPluginsByOwner(login: string): PluginRecord[] {
  const normalized = login.toLowerCase()
  return catalog.filter(
    (plugin) => pluginOwnerLogin(plugin).toLowerCase() === normalized
  )
}
