import type { InstalledPlugin, PendingSelfUpdate } from "../shared/directory"
import { getSelfUpdateRecoveryState } from "../shared/directory"

export async function startPreparedSelfUpdate(
  apply: (input: { token: string }) => Promise<unknown>,
  token: string
): Promise<void> {
  try {
    await apply({ token })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Plugin stopped: paseo-cafe")
    ) {
      return
    }
    throw error
  }
}

export function resolveSelfUpdateRecoveryState(
  pending: PendingSelfUpdate,
  installations: readonly InstalledPlugin[],
  failedRequestAt: string | null,
  now = Date.now()
): "pending" | "succeeded" | "failed" {
  if (failedRequestAt === pending.requestedAt) return "failed"
  return getSelfUpdateRecoveryState(pending, installations, now)
}
