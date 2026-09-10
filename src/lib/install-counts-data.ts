import snapshotJson from "../../data/install-counts.json"
import {
  type InstallCountsSnapshot,
  parseInstallCountsSnapshot,
} from "./install-counts"
import { listPlugins } from "./plugins-data"

export interface PublishedInstallCount {
  count: number
  asOf: string
  trackingSince: string
  fetchedAt: string
  stale: boolean
}

let snapshot: InstallCountsSnapshot | null = null
try {
  snapshot = parseInstallCountsSnapshot(
    snapshotJson,
    listPlugins().map((plugin) => plugin.id)
  )
} catch {
  // Malformed generated count data is optional, never a reason to break the
  // static directory. Missing per-plugin counts remain unavailable, not zero.
}

export function getPublishedInstallCount(
  pluginId: string
): PublishedInstallCount | null {
  if (
    snapshot === null ||
    snapshot.data === null ||
    snapshot.fetchedAt === null ||
    snapshot.data.asOf === null ||
    snapshot.data.trackingSince === null
  ) {
    return null
  }

  const count = snapshot.data.counts[pluginId]
  if (count === undefined) return null

  return {
    count,
    asOf: snapshot.data.asOf,
    trackingSince: snapshot.data.trackingSince,
    fetchedAt: snapshot.fetchedAt,
    stale: snapshot.status === "stale",
  }
}

export function formatInstallCount(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}
