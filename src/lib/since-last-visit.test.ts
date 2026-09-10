import { describe, expect, it } from "vitest"
import type { PluginRecord } from "./plugin-schema"
import {
  isAddedSince,
  isUpdatedSince,
  selectAddedSince,
  selectUpdatedSince,
} from "./since-last-visit"

function plugin(
  id: string,
  addedAt?: string,
  updatedAt?: string
): PluginRecord {
  return {
    id,
    repo: `someone/${id}`,
    url: `https://github.com/someone/${id}`,
    name: id,
    description: "",
    categories: [],
    platforms: [],
    caveats: [],
    health: {
      manifestValid: true,
      hasReadme: true,
      hasLicense: true,
      hasTests: true,
      hasTypecheckScript: true,
      updatedRecently: true,
    },
    images: [],
    videos: [],
    addedAt,
    updatedAt,
    scannedAt: "2026-09-09T00:00:00.000Z",
  }
}

describe("isAddedSince", () => {
  it("is new when it arrived after the last visit", () => {
    expect(
      isAddedSince(
        plugin("skills", "2026-09-08T00:00:00.000Z"),
        "2026-09-01T00:00:00.000Z"
      )
    ).toBe(true)
  })

  it("is not new when it was already there at the last visit", () => {
    expect(
      isAddedSince(
        plugin("skills", "2026-09-01T00:00:00.000Z"),
        "2026-09-08T00:00:00.000Z"
      )
    ).toBe(false)
  })

  it("is not new when it arrived exactly at the last visit", () => {
    const at = "2026-09-08T00:00:00.000Z"
    expect(isAddedSince(plugin("skills", at), at)).toBe(false)
  })

  it("is not new on a first visit", () => {
    expect(
      isAddedSince(plugin("skills", "2026-09-08T00:00:00.000Z"), null)
    ).toBe(false)
  })

  it("is not new when the record has no addedAt", () => {
    expect(isAddedSince(plugin("skills"), "2026-09-01T00:00:00.000Z")).toBe(
      false
    )
  })

  it("is not new when the stored visit is unparseable", () => {
    expect(
      isAddedSince(plugin("skills", "2026-09-08T00:00:00.000Z"), "yesterday")
    ).toBe(false)
  })

  it("is not new when addedAt is unparseable", () => {
    expect(
      isAddedSince(plugin("skills", "not a date"), "2026-09-01T00:00:00.000Z")
    ).toBe(false)
  })
})

describe("selectAddedSince", () => {
  it("keeps only the plugins added after the last visit", () => {
    const plugins = [
      plugin("old", "2026-08-01T00:00:00.000Z"),
      plugin("new", "2026-09-08T00:00:00.000Z"),
      plugin("undated"),
    ]
    expect(
      selectAddedSince(plugins, "2026-09-01T00:00:00.000Z").map((p) => p.id)
    ).toEqual(["new"])
  })

  it("selects nothing without a previous visit", () => {
    expect(
      selectAddedSince([plugin("new", "2026-09-08T00:00:00.000Z")], null)
    ).toEqual([])
  })
})

describe("isUpdatedSince", () => {
  const lastVisit = "2026-09-05T00:00:00.000Z"

  it("is updated when the version changed after the last visit", () => {
    expect(
      isUpdatedSince(
        plugin(
          "skills",
          "2026-08-01T00:00:00.000Z",
          "2026-09-08T00:00:00.000Z"
        ),
        lastVisit
      )
    ).toBe(true)
  })

  it("is not updated when the version change predates the last visit", () => {
    expect(
      isUpdatedSince(
        plugin(
          "skills",
          "2026-08-01T00:00:00.000Z",
          "2026-09-02T00:00:00.000Z"
        ),
        lastVisit
      )
    ).toBe(false)
  })

  it("is not updated when the plugin is new to this visitor", () => {
    const justArrived = plugin(
      "skills",
      "2026-09-07T00:00:00.000Z",
      "2026-09-08T00:00:00.000Z"
    )
    expect(isAddedSince(justArrived, lastVisit)).toBe(true)
    expect(isUpdatedSince(justArrived, lastVisit)).toBe(false)
  })

  it("is not updated when the record has no updatedAt", () => {
    expect(
      isUpdatedSince(plugin("skills", "2026-08-01T00:00:00.000Z"), lastVisit)
    ).toBe(false)
  })

  it("is not updated on a first visit", () => {
    expect(
      isUpdatedSince(
        plugin(
          "skills",
          "2026-08-01T00:00:00.000Z",
          "2026-09-08T00:00:00.000Z"
        ),
        null
      )
    ).toBe(false)
  })
})

describe("selectUpdatedSince", () => {
  it("keeps only the plugins bumped since the last visit, minus the new ones", () => {
    const plugins = [
      plugin("stale", "2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z"),
      plugin("bumped", "2026-08-01T00:00:00.000Z", "2026-09-08T00:00:00.000Z"),
      plugin(
        "brand-new",
        "2026-09-07T00:00:00.000Z",
        "2026-09-07T00:00:00.000Z"
      ),
      plugin("undated", "2026-08-01T00:00:00.000Z"),
    ]
    expect(
      selectUpdatedSince(plugins, "2026-09-05T00:00:00.000Z").map((p) => p.id)
    ).toEqual(["bumped"])
  })
})
