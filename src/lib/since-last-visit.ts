import type { PluginRecord } from "@/lib/plugin-schema"

/**
 * "What's changed since I was last here?" — compares the scan-time dates on a
 * record against an ISO timestamp of the visitor's previous visit, which only
 * ever lives in their own browser (see src/hooks/use-last-visit.ts). The site
 * is static, so this is the whole mechanism: no accounts, no server, no
 * request to us.
 *
 * Anything unusable — no previous visit, an unparseable stored value, or a
 * record missing the date — counts as unchanged. Guessing here would light up
 * the entire catalog, which is worse than showing nothing.
 */
function isAfter(date: string | undefined, since: string | null): boolean {
  if (!since || !date) return false
  const cutoff = Date.parse(since)
  const at = Date.parse(date)
  if (Number.isNaN(cutoff) || Number.isNaN(at)) return false
  return at > cutoff
}

/** Joined the directory since the visitor's last visit. */
export function isAddedSince(
  plugin: PluginRecord,
  since: string | null
): boolean {
  return isAfter(plugin.addedAt, since)
}

/**
 * Bumped its version since the visitor's last visit. Deliberately excludes
 * plugins that are new to them: everything about a plugin you've never seen is
 * new, so calling it "updated" as well is noise.
 */
export function isUpdatedSince(
  plugin: PluginRecord,
  since: string | null
): boolean {
  return isAfter(plugin.updatedAt, since) && !isAddedSince(plugin, since)
}

export function selectAddedSince(
  plugins: PluginRecord[],
  since: string | null
): PluginRecord[] {
  return plugins.filter((plugin) => isAddedSince(plugin, since))
}

export function selectUpdatedSince(
  plugins: PluginRecord[],
  since: string | null
): PluginRecord[] {
  return plugins.filter((plugin) => isUpdatedSince(plugin, since))
}
