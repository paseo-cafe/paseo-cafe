import type { PluginRecord } from "@/lib/plugin-schema"

/**
 * "What's arrived since I was last here?" — compares a plugin's `addedAt`
 * (the commit that added its registry entry, stamped at scan time) against an
 * ISO timestamp of the visitor's previous visit, which only ever lives in
 * their own browser (see src/hooks/use-last-visit.ts). The site is static, so
 * this is the whole mechanism: no accounts, no server, no request to us.
 *
 * Anything unusable — no previous visit, an unparseable stored value, or a
 * record with no addedAt — counts as *not* new. Guessing here would mark the
 * entire catalog as new, which is worse than showing nothing.
 */
export function isAddedSince(
  plugin: PluginRecord,
  since: string | null
): boolean {
  if (!since || !plugin.addedAt) return false
  const cutoff = Date.parse(since)
  const added = Date.parse(plugin.addedAt)
  if (Number.isNaN(cutoff) || Number.isNaN(added)) return false
  return added > cutoff
}

export function selectAddedSince(
  plugins: PluginRecord[],
  since: string | null
): PluginRecord[] {
  return plugins.filter((plugin) => isAddedSince(plugin, since))
}
