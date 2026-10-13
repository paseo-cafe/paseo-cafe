import { describe, expect, it } from "vitest"
import type { PluginUpdate } from "../shared/directory"
import { hasAvailableUpdate, summarizeAutomaticUpdates } from "./update-status"

const UPDATES = new Map<string, PluginUpdate>(
  (
    [
      { id: "needs-update", outcome: "update", target: "2.0.0" },
      { id: "up-to-date", outcome: "current" },
      { id: "ahead", outcome: "installed-newer" },
      { id: "dev-copy", outcome: "local" },
      { id: "unreachable", outcome: "error", error: "registry offline" },
    ] satisfies PluginUpdate[]
  ).map((update) => [update.id, update])
)

describe("hasAvailableUpdate", () => {
  it("is true when any installation has an update", () => {
    expect(
      hasAvailableUpdate(
        [{ id: "up-to-date" }, { id: "needs-update" }],
        UPDATES
      )
    ).toBe(true)
  })

  it("counts only the update outcome, not the other statuses", () => {
    for (const id of ["up-to-date", "ahead", "dev-copy", "unreachable"]) {
      expect(hasAvailableUpdate([{ id }], UPDATES)).toBe(false)
    }
  })

  it("is false for an installation the update check did not report", () => {
    expect(hasAvailableUpdate([{ id: "not-checked" }], UPDATES)).toBe(false)
  })

  it("is false without installations", () => {
    expect(hasAvailableUpdate([], UPDATES)).toBe(false)
  })
})

describe("summarizeAutomaticUpdates", () => {
  it("does not treat plugins with automatic updates off as a failure", () => {
    expect(
      summarizeAutomaticUpdates([
        { status: "updated" },
        {
          status: "skipped",
          message: "Automatic updates are off for this plugin.",
        },
      ])
    ).toEqual({
      failed: false,
      message: "Updated 1 plugin. 1 skipped (automatic updates off).",
    })
  })

  it("reports a failure with its message and still counts skips", () => {
    expect(
      summarizeAutomaticUpdates([
        { status: "failed", message: "registry offline" },
        { status: "skipped" },
      ])
    ).toEqual({
      failed: true,
      message:
        "Updated 0 plugins; 1 failed. 1 skipped (automatic updates off). registry offline",
    })
  })
})
