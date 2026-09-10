import { describe, expect, it } from "vitest"
import { failedInstallCountsSnapshot, parseCafeCounts } from "./install-counts"

const catalogIds = ["alpha-plugin", "beta-plugin"]
const published = {
  schemaVersion: 1,
  asOf: "2026-09-10T00:00:00.000Z",
  trackingSince: "2026-09-08T12:00:00.000Z",
  counts: { "alpha-plugin": 3, "beta-plugin": 0 },
}

describe("Cafe install count schemas", () => {
  it("accepts an exact catalog snapshot and preserves a reported zero", () => {
    expect(parseCafeCounts(published, catalogIds)).toEqual(published)
  })

  it("preserves existing counts across independently deployed catalogs", () => {
    expect(
      parseCafeCounts(
        { ...published, counts: { "alpha-plugin": 3, "removed-plugin": 9 } },
        catalogIds
      ).counts
    ).toEqual({ "alpha-plugin": 3 })
  })

  it("rejects unsafe and prematurely published counts", () => {
    expect(() =>
      parseCafeCounts(
        {
          ...published,
          counts: {
            "alpha-plugin": Number.MAX_SAFE_INTEGER + 1,
            "beta-plugin": 0,
          },
        },
        catalogIds
      )
    ).toThrow()
    expect(() =>
      parseCafeCounts(
        {
          schemaVersion: 1,
          asOf: null,
          trackingSince: "2026-09-10T12:00:00.000Z",
          counts: { "alpha-plugin": 0, "beta-plugin": 0 },
        },
        catalogIds
      )
    ).toThrow(/must be empty/)
  })

  it("retains only a valid prior success when a refresh fails", () => {
    const previous = {
      schemaVersion: 1,
      status: "available",
      attemptedAt: "2026-09-10T01:00:00.000Z",
      fetchedAt: "2026-09-10T01:00:00.000Z",
      data: published,
    }

    expect(
      failedInstallCountsSnapshot(
        previous,
        "2026-09-11T01:00:00.000Z",
        catalogIds
      )
    ).toMatchObject({
      status: "stale",
      attemptedAt: "2026-09-11T01:00:00.000Z",
      fetchedAt: "2026-09-10T01:00:00.000Z",
      data: published,
    })

    expect(
      failedInstallCountsSnapshot(
        { ...previous, data: { ...published, counts: { "alpha-plugin": -1 } } },
        "2026-09-11T01:00:00.000Z",
        catalogIds
      )
    ).toEqual({
      schemaVersion: 1,
      status: "unavailable",
      attemptedAt: "2026-09-11T01:00:00.000Z",
      fetchedAt: null,
      data: null,
    })
  })
})
