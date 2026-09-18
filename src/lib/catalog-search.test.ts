import { describe, expect, it } from "vitest"
import {
  parseCatalogSearch,
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

  it("offers listing-date sorting and retires repository-activity sorting", () => {
    expect(sortOptions).toEqual(["popular", "added", "az"])
    expect(sortLabels.added).toBe("Recent")
    expect(parseCatalogSearch({ sort: "added" }).sort).toBe("added")
    expect(parseCatalogSearch({ sort: "updated" }).sort).toBe("popular")
  })
})

describe("npm-first catalog sorting", () => {
  const npm = (id: string, downloadsLast30Days: number, publishedAt: string) =>
    plugin(id, {
      npm: {
        package: id,
        version: "1.0.0",
        integrity: `sha512-${"a".repeat(86)}`,
        downloadsLast30Days,
        publishedAt,
      },
    })

  it("ranks npm downloads then publication date before Git stars", () => {
    const sorted = sortPlugins(
      [
        plugin("git", {
          repoMeta: {
            stars: 10_000,
            openIssues: 0,
            defaultBranch: "main",
            pushedAt: "2026-09-01T00:00:00.000Z",
            topics: [],
            archived: false,
            license: null,
          },
        }),
        npm("older", 20, "2026-01-01T00:00:00.000Z"),
        npm("newer", 20, "2026-09-01T00:00:00.000Z"),
        npm("popular", 30, "2026-01-01T00:00:00.000Z"),
      ],
      "popular"
    )

    expect(sorted.map((entry) => entry.id)).toEqual([
      "popular",
      "newer",
      "older",
      "git",
    ])
  })

  it("groups npm before Git for recency and alphabetical sorting", () => {
    const entries = [
      plugin("a-git", { addedAt: "2026-09-10T00:00:00.000Z" }),
      npm("z-npm", 1, "2026-09-01T00:00:00.000Z"),
      npm("a-npm", 1, "2026-09-11T00:00:00.000Z"),
    ]

    expect(sortPlugins(entries, "added").map((entry) => entry.id)).toEqual([
      "a-npm",
      "z-npm",
      "a-git",
    ])
    expect(sortPlugins(entries, "az").map((entry) => entry.id)).toEqual([
      "a-npm",
      "z-npm",
      "a-git",
    ])
  })
})
