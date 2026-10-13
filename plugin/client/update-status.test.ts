import { describe, expect, it } from "vitest"
import type { PluginUpdate } from "../shared/directory"
import { hasAvailableUpdate } from "./update-status"

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
