import { describe, expect, it, vi } from "vitest"
import { installedPluginSchema } from "../shared/directory"
import {
  resolveSelfUpdateRecoveryState,
  startPreparedSelfUpdate,
} from "./self-update"

const pending = {
  installationId: "paseo-cafe",
  source: "npm" as const,
  targetRevision: "0.6.0",
  requestedAt: "2026-09-19T12:00:00.000Z",
}

const oldInstallation = installedPluginSchema.parse({
  id: "paseo-cafe",
  path: "/tmp/paseo-cafe",
  enabled: true,
  status: "running",
  source: "npm",
  version: "0.5.0",
})

describe("self-update client handoff", () => {
  it("does not settle before the apply RPC settles", async () => {
    let resolveApply: (value: unknown) => void = () => undefined
    const applyPending = new Promise<unknown>((resolve) => {
      resolveApply = resolve
    })
    const apply = vi.fn(() => applyPending)
    let settled = false
    const started = startPreparedSelfUpdate(apply, "token").finally(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)
    resolveApply({ accepted: true })
    await expect(started).resolves.toBeUndefined()
    expect(apply).toHaveBeenCalledWith({ token: "token" })
  })

  it("treats the expected plugin restart disconnect as accepted", async () => {
    await expect(
      startPreparedSelfUpdate(async () => {
        throw new Error("Request failed: Plugin stopped: paseo-cafe")
      }, "token")
    ).resolves.toBeUndefined()
  })

  it("surfaces other apply failures", async () => {
    await expect(
      startPreparedSelfUpdate(async () => {
        throw new Error("spawn failed")
      }, "token")
    ).rejects.toThrow("spawn failed")
  })

  it("immediately fails persisted evidence for a rejected apply", () => {
    expect(
      resolveSelfUpdateRecoveryState(
        pending,
        [oldInstallation],
        pending.requestedAt,
        Date.parse("2026-09-19T12:00:01.000Z")
      )
    ).toBe("failed")
  })
})
