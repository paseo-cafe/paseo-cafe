import type { InstalledPlugin, PluginUpdate } from "../shared/directory"

/**
 * The surface and the sidebar badge read the same query, so a check made by
 * either one fills the other's cache (the plugin's query client is shared).
 * Update status is about the daemon's installed plugins, not a registry, so
 * the key does not vary with the registry URL.
 */
export const UPDATE_STATUS_QUERY_KEY = ["paseo-cafe-update-status"] as const

/** Whether any of these installations has an update the user can apply. */
export function hasAvailableUpdate(
  installations: readonly Pick<InstalledPlugin, "id">[],
  updates: ReadonlyMap<string, Pick<PluginUpdate, "outcome">>
): boolean {
  return installations.some(
    (installation) => updates.get(installation.id)?.outcome === "update"
  )
}
