import type {
  DirectoryEntry,
  InstalledPlugin,
  LifecycleEventType,
  ObservedPlugins,
} from "../shared/directory"
import { findInstallations } from "../shared/directory"

export interface PendingLifecycleEvent {
  pluginId: string
  event: LifecycleEventType
}

function installationFingerprint(
  installations: readonly InstalledPlugin[]
): string {
  return [
    ...new Set(
      installations.map(
        (installation) =>
          `${installation.source}:${installation.commit ?? installation.ref ?? "present"}`
      )
    ),
  ]
    .sort()
    .join("|")
}

export function observeCatalogPlugins(
  entries: readonly Pick<DirectoryEntry, "id" | "repo" | "path">[],
  installations: readonly InstalledPlugin[]
): ObservedPlugins {
  const observed: ObservedPlugins = {}
  for (const entry of entries) {
    const matches = findInstallations(entry, installations)
    if (matches.length > 0) {
      observed[entry.id] = installationFingerprint(matches)
    }
  }
  return observed
}

export function observedPluginsEqual(
  left: ObservedPlugins,
  right: ObservedPlugins
): boolean {
  const leftIds = Object.keys(left)
  const rightIds = Object.keys(right)
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((pluginId) => left[pluginId] === right[pluginId])
  )
}

export function claimObservedInstall(
  observed: ObservedPlugins,
  pluginId: string
): { claimed: boolean; observed: ObservedPlugins } {
  if (observed[pluginId] !== undefined) return { claimed: false, observed }
  return {
    claimed: true,
    observed: { ...observed, [pluginId]: "pending" },
  }
}

export function reconcileCatalogPlugins(
  previous: ObservedPlugins,
  current: ObservedPlugins,
  catalogPluginIds: readonly string[]
): { events: PendingLifecycleEvent[]; observed: ObservedPlugins } {
  const events: PendingLifecycleEvent[] = []
  const observed = { ...current }
  const catalogIds = new Set(catalogPluginIds)
  for (const [pluginId, fingerprint] of Object.entries(current)) {
    const previousFingerprint = previous[pluginId]
    if (previousFingerprint === undefined) {
      events.push({ pluginId, event: "install" })
    } else if (
      previousFingerprint !== "pending" &&
      previousFingerprint !== fingerprint
    ) {
      events.push({ pluginId, event: "update" })
    }
  }
  for (const [pluginId, fingerprint] of Object.entries(previous)) {
    if (pluginId in current) continue
    if (catalogIds.has(pluginId)) events.push({ pluginId, event: "uninstall" })
    else observed[pluginId] = fingerprint
  }
  events.sort((left, right) =>
    `${left.pluginId}:${left.event}`.localeCompare(
      `${right.pluginId}:${right.event}`
    )
  )
  return { events, observed }
}
