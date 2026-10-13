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

export interface AutomaticUpdateSummary {
  /** Only failures are errors: a skipped plugin has automatic updates off by choice. */
  failed: boolean
  message: string
}

/** The toast text for a "Run now" pass over every installed plugin. */
export function summarizeAutomaticUpdates(
  outcomes: readonly { status: string; message?: string }[]
): AutomaticUpdateSummary {
  const updated = outcomes.filter((o) => o.status === "updated").length
  const failures = outcomes.filter((o) => o.status === "failed")
  const skipped = outcomes.filter((o) => o.status === "skipped").length
  const plural = updated === 1 ? "" : "s"
  const skippedNote =
    skipped > 0 ? ` ${skipped} skipped (automatic updates off).` : ""
  if (failures.length > 0) {
    const first = failures[0]?.message
    return {
      failed: true,
      message: `Updated ${updated} plugin${plural}; ${failures.length} failed.${skippedNote}${first ? ` ${first}` : ""}`,
    }
  }
  return {
    failed: false,
    message: `${
      updated > 0
        ? `Updated ${updated} plugin${plural}.`
        : "No automatic updates available."
    }${skippedNote}`,
  }
}
