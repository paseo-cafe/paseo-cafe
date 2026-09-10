import { describe, expect, it } from "vitest"
import type { PluginRecord } from "@/lib/plugin-schema"
import { sortPlugins } from "@/lib/sort-plugins"

const health = {
  manifestValid: true,
  hasReadme: true,
  hasLicense: true,
  hasTests: true,
  hasTypecheckScript: true,
  updatedRecently: true,
}

function plugin(overrides: Partial<PluginRecord> & { id: string }): PluginRecord {
  return {
    repo: `owner/${overrides.id}`,
    url: `https://github.com/owner/${overrides.id}`,
    name: overrides.id,
    description: "",
    categories: [],
    platforms: [],
    caveats: [],
    health,
    images: [],
    videos: [],
    scannedAt: "2026-01-01T00:00:00.000Z",
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("sortPlugins", () => {
  const plugins = [
    plugin({
      id: "old-popular",
      addedAt: "2026-01-01T00:00:00.000Z",
      repoMeta: {
        stars: 100,
        openIssues: 0,
        defaultBranch: "main",
        pushedAt: "2026-01-05T00:00:00.000Z",
        topics: [],
        archived: false,
        license: null,
      },
    }),
    plugin({
      id: "new-unstarred",
      addedAt: "2026-03-01T00:00:00.000Z",
      repoMeta: {
        stars: 1,
        openIssues: 0,
        defaultBranch: "main",
        pushedAt: "2026-01-02T00:00:00.000Z",
        topics: [],
        archived: false,
        license: null,
      },
    }),
    plugin({
      id: "broken-scan",
      addedAt: "2026-02-01T00:00:00.000Z",
      scanError: "repo not found",
    }),
    plugin({
      id: "recently-pushed",
      addedAt: "2026-01-15T00:00:00.000Z",
      repoMeta: {
        stars: 5,
        openIssues: 0,
        defaultBranch: "main",
        pushedAt: "2026-04-01T00:00:00.000Z",
        topics: [],
        archived: false,
        license: null,
      },
    }),
  ]

  it("orders 'latest' by addedAt, newest first", () => {
    expect(sortPlugins(plugins, "latest").map((p) => p.id)).toEqual([
      "new-unstarred",
      "broken-scan",
      "recently-pushed",
      "old-popular",
    ])
  })

  it("orders 'stars' by repoMeta.stars, treating a missing repoMeta as zero", () => {
    expect(sortPlugins(plugins, "stars").map((p) => p.id)).toEqual([
      "old-popular",
      "recently-pushed",
      "new-unstarred",
      "broken-scan",
    ])
  })

  it("orders 'updated' by repoMeta.pushedAt, falling back to scannedAt when missing", () => {
    expect(sortPlugins(plugins, "updated").map((p) => p.id)).toEqual([
      "recently-pushed",
      "old-popular",
      "new-unstarred",
      "broken-scan",
    ])
  })

  it("does not mutate the input array", () => {
    const copy = [...plugins]
    sortPlugins(plugins, "stars")
    expect(plugins).toEqual(copy)
  })
})
