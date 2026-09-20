import type { InstalledPlugin, PendingSelfUpdate } from "../shared/directory"
import { getSelfUpdateRecoveryState } from "../shared/directory"

export async function startPreparedSelfUpdate(
  apply: (input: { token: string }) => Promise<unknown>,
  token: string
): Promise<"accepted" | "uncertain"> {
  try {
    await apply({ token })
    return "accepted"
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Plugin stopped: paseo-cafe")
    ) {
      return "accepted"
    }
    if (
      error instanceof Error &&
      error.message.includes("Self-update request expired")
    ) {
      return "uncertain"
    }
    throw error
  }
}

export function resolveSelfUpdateRecoveryState(
  pending: PendingSelfUpdate,
  installations: readonly InstalledPlugin[],
  failedRequestAt: string | null,
  now = Date.now()
): "pending" | "succeeded" | "failed" | "unknown" {
  if (failedRequestAt === pending.requestedAt) return "failed"
  return getSelfUpdateRecoveryState(pending, installations, now)
}
