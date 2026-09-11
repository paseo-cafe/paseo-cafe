import { describe, expect, it } from "vitest"
import {
  parseCatalogSearch,
  sortDateField,
  sortLabels,
  sortOptions,
  sortPlugins,
} from "./catalog-search"
import type { PluginRecord } from "./plugin-schema"

function plugin(
  id: string,
  overrides: Partial<PluginRecord> = {}
): PluginRecord {
  return {
    id,
    repo: `acme/${id}`,
    url: `https://github.com/acme/${id}`,
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
    scannedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("sortPlugins by listing date", () => {
  it("puts the most recently listed plugin first", () => {
    const sorted = sortPlugins(
      [
        plugin("older", { addedAt: "2026-01-05T00:00:00+00:00" }),
        plugin("newest", { addedAt: "2026-09-05T00:00:00+00:00" }),
        plugin("middle", { addedAt: "2026-05-05T00:00:00+00:00" }),
      ],
      "added"
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      "newest",
      "middle",
      "older",
    ])
  })

  it("sorts plugins with no known listing date last, by name", () => {
    const sorted = sortPlugins(
      [
        plugin("unknown-b"),
        plugin("listed", { addedAt: "2020-01-01T00:00:00+00:00" }),
        plugin("unknown-a"),
      ],
      "added"
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      "listed",
      "unknown-a",
      "unknown-b",
    ])
  })

  it("ignores an unparseable date rather than ranking it highest", () => {
    const sorted = sortPlugins(
      [
        plugin("broken", { addedAt: "not-a-date" }),
        plugin("listed", { addedAt: "2026-02-02T00:00:00+00:00" }),
      ],
      "added"
    )

    expect(sorted.map((entry) => entry.id)).toEqual(["listed", "broken"])
  })

  it("offers the sort in the catalog UI and accepts it as a search param", () => {
    expect(sortOptions).toContain("added")
    expect(sortLabels.added).toBe("Recently added")
    expect(parseCatalogSearch({ sort: "added" }).sort).toBe("added")
  })
})

describe("sortDateField", () => {
  it("labels the date each sort orders by, and no other", () => {
    expect(sortDateField("added")).toBe("added")
    expect(sortDateField("updated")).toBe("updated")
    expect(sortDateField("popular")).toBeUndefined()
    expect(sortDateField("az")).toBeUndefined()
  })
})
