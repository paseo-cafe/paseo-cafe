import { describe, expect, it } from "vitest"
import { countAvailableUpdates, updateStatusQueryKey } from "./update-status"

describe("countAvailableUpdates", () => {
  it("counts only installations with an update the user can apply", () => {
    expect(
      countAvailableUpdates([
        { updateState: "available" },
        { updateState: "available" },
        { updateState: "current" },
        { updateState: "unknown" },
        { updateState: "pinned" },
        { updateState: "diverged" },
      ])
    ).toBe(2)
  })

  it("is zero for an empty inventory", () => {
    expect(countAvailableUpdates([])).toBe(0)
  })
})

describe("updateStatusQueryKey", () => {
  it("changes with the catalog URL and the preview opt-ins that change the answer", () => {
    const base = updateStatusQueryKey(undefined, [])
    expect(updateStatusQueryKey("https://a.example/api", [])).not.toEqual(base)
    expect(updateStatusQueryKey(undefined, ["x"])).not.toEqual(base)
    expect(updateStatusQueryKey(undefined, ["x"])).toEqual(
      updateStatusQueryKey(undefined, ["x"])
    )
  })
})
