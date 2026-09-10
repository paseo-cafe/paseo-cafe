import { describe, expect, it, vi } from "vitest"
import { updateInstallReportingPreference } from "./install-reporting"

describe("install reporting preference", () => {
  it("does not synchronize when saving the preference fails", async () => {
    const synchronize = vi.fn(async () => {})

    expect(
      await updateInstallReportingPreference(
        false,
        async () => false,
        synchronize
      )
    ).toBe("save-failed")
    expect(synchronize).not.toHaveBeenCalled()
  })

  it("waits for cancellation and reports a partial failure", async () => {
    let release: (() => void) | undefined
    const cancellation = new Promise<void>((resolve) => {
      release = resolve
    })
    const result = updateInstallReportingPreference(
      false,
      async () => true,
      () => cancellation
    )
    let settled = false
    void result.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    release?.()
    await expect(result).resolves.toBe("saved")

    await expect(
      updateInstallReportingPreference(
        false,
        async () => true,
        async () => {
          throw new Error("offline")
        }
      )
    ).resolves.toBe("sync-failed")
  })

  it("explicitly re-enables daemon reporting", async () => {
    const synchronize = vi.fn(async () => {})
    await expect(
      updateInstallReportingPreference(true, async () => true, synchronize)
    ).resolves.toBe("saved")
    expect(synchronize).toHaveBeenCalledWith(true)
  })
})
