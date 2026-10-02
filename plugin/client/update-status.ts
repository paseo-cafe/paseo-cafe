import type { InstalledPlugin } from "../shared/directory"

export const UPDATE_STATUS_QUERY_KEY = "paseo-cafe-update-status"

/**
 * The surface and the sidebar badge read the same query, so a check made by
 * either one fills the other's cache (the plugin's query client is shared).
 */
export function updateStatusQueryKey(
  baseUrl: string | undefined,
  previewOptIns: readonly string[]
): readonly [string, string | undefined, string] {
  return [UPDATE_STATUS_QUERY_KEY, baseUrl, previewOptIns.join("\u0000")]
}

export function countAvailableUpdates(
  installations: readonly Pick<InstalledPlugin, "updateState">[]
): number {
  return installations.filter(
    (installation) => installation.updateState === "available"
  ).length
}
