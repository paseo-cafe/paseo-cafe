import { describe, expect, it } from "vitest"
import { NO_PREVIOUS_VISIT, resolveVisit } from "./last-visit"

describe("resolveVisit", () => {
  it("uses the stored previous visit the first time a tab session loads the site", () => {
    expect(resolveVisit(null, "2026-09-01T00:00:00.000Z")).toEqual({
      lastVisit: "2026-09-01T00:00:00.000Z",
      isNewSession: true,
    })
  })

  it("reports no previous visit for a brand new browser", () => {
    expect(resolveVisit(null, null)).toEqual({
      lastVisit: null,
      isNewSession: true,
    })
  })

  it("keeps the pinned reference on a reload, so the new plugins don't vanish", () => {
    expect(
      resolveVisit("2026-09-01T00:00:00.000Z", "2026-09-09T00:00:00.000Z")
    ).toEqual({ lastVisit: "2026-09-01T00:00:00.000Z", isNewSession: false })
  })

  it("keeps a pinned first visit pinned", () => {
    expect(resolveVisit(NO_PREVIOUS_VISIT, "2026-09-09T00:00:00.000Z")).toEqual(
      {
        lastVisit: null,
        isNewSession: false,
      }
    )
  })
})
