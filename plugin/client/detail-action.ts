import type { PluginUpdate } from "../shared/directory"

/** What the detail page's sticky bar offers as its one primary action. */
export type DetailPrimaryAction<T extends { id: string }> =
  | {
      kind: "update"
      /** The installation the bar acts on; the others keep their own cards. */
      target: T
      /** How many installations have an update waiting. */
      count: number
    }
  | { kind: "installed" }
  | { kind: "install" }

/**
 * Update if any installation has an update waiting, else a disabled
 * "Installed", else install. Undefined when installing is not possible, which
 * is when the host's inventory is unreadable or the registry URL has no
 * install command.
 */
export function getDetailPrimaryAction<T extends { id: string }>({
  installations,
  updates,
  inventoryAvailable,
  installable,
}: {
  installations: readonly T[]
  updates: ReadonlyMap<string, Pick<PluginUpdate, "outcome">>
  inventoryAvailable: boolean
  installable: boolean
}): DetailPrimaryAction<T> | undefined {
  const updatable = installations.filter(
    (installation) => updates.get(installation.id)?.outcome === "update"
  )
  const [target] = updatable
  if (target) return { kind: "update", target, count: updatable.length }
  if (installations.length > 0) return { kind: "installed" }
  return inventoryAvailable && installable ? { kind: "install" } : undefined
}
