import { describe, expect, it } from "vitest"
import type {
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import { directoryEntrySchema } from "../shared/directory"
import { dateBadgeForSortMode, sortEntries } from "./sort"

const NO_INSTALLATIONS = new Map<string, readonly InstalledPlugin[]>()
const NO_UPDATES = new Map<string, PluginUpdate>()

interface EntryOptions {
  name?: string
  installs?: number
  publishedAt?: string
  updatedAt?: string
}

/** A schema-valid git-pinned entry with only the fields a test cares about. */
function entry(
  id: string,
  {
    name = id,
    installs,
    publishedAt = "2026-01-01T00:00:00Z",
    updatedAt = "2026-01-01T00:00:00Z",
  }: EntryOptions = {}
): DirectoryEntry {
  return directoryEntrySchema.parse({
    id: `acme/${id}`,
    name,
    author: { github: "acme" },
    repository: { url: `https://github.com/acme/${id}` },
    artifact: {
      kind: "git",
      remote: `https://github.com/acme/${id}`,
      commit: "a".repeat(40),
    },
    publishedAt,
    updatedAt,
    installs,
  })
}

function installation(id: string): InstalledPlugin {
  return { id, enabled: true, status: "running", kind: "git" }
}

function ids(entries: readonly DirectoryEntry[]): string[] {
  return entries.map((item) => item.id.replace("acme/", ""))
}

describe("directory sort modes", () => {
  it("puts plugins with an available update first, then orders by installs", () => {
    const entries = [
      entry("popular", { installs: 900 }),
      entry("stale-small", { installs: 5 }),
      entry("stale-large", { installs: 50 }),
      entry("current", { installs: 700 }),
      entry("broken-check", { installs: 800 }),
    ]
    const installations = new Map<string, readonly InstalledPlugin[]>([
      ["acme/stale-small", [installation("stale-small")]],
      ["acme/stale-large", [installation("stale-large")]],
      ["acme/current", [installation("current")]],
      ["acme/broken-check", [installation("broken-check")]],
    ])
    const updates = new Map<string, PluginUpdate>([
      ["stale-small", { id: "stale-small", outcome: "update" }],
      ["stale-large", { id: "stale-large", outcome: "update" }],
      ["current", { id: "current", outcome: "current" }],
      ["broken-check", { id: "broken-check", outcome: "error" }],
    ])

    expect(
      ids(sortEntries(entries, "updates-first", installations, updates))
    ).toEqual([
      "stale-large",
      "stale-small",
      "popular",
      "broken-check",
      "current",
    ])
  })

  it("counts an update on any one of a plugin's installations", () => {
    const entries = [entry("a", { installs: 10 }), entry("b", { installs: 1 })]
    const installations = new Map<string, readonly InstalledPlugin[]>([
      ["acme/b", [installation("b-first"), installation("b-second")]],
    ])
    const updates = new Map<string, PluginUpdate>([
      ["b-first", { id: "b-first", outcome: "current" }],
      ["b-second", { id: "b-second", outcome: "update" }],
    ])

    expect(
      ids(sortEntries(entries, "updates-first", installations, updates))
    ).toEqual(["b", "a"])
  })

  it("orders by installs under 'popular', treating a missing count as zero", () => {
    const entries = [
      entry("unknown"),
      entry("few", { installs: 3 }),
      entry("many", { installs: 300 }),
      entry("none", { installs: 0 }),
    ]

    expect(
      ids(sortEntries(entries, "popular", NO_INSTALLATIONS, NO_UPDATES))
    ).toEqual(["many", "few", "none", "unknown"])
  })

  it("orders by update date under 'recent', ignoring when a plugin was listed", () => {
    const entries = [
      entry("listed-first", {
        publishedAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-09-20T00:00:00Z",
      }),
      entry("listed-last", {
        publishedAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      }),
    ]

    expect(
      ids(sortEntries(entries, "recent", NO_INSTALLATIONS, NO_UPDATES))
    ).toEqual(["listed-first", "listed-last"])
  })

  it("orders by listing date under 'recently-added', ignoring updates", () => {
    const entries = [
      entry("listed-first", {
        publishedAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-09-20T00:00:00Z",
      }),
      entry("listed-last", {
        publishedAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      }),
    ]

    expect(
      ids(sortEntries(entries, "recently-added", NO_INSTALLATIONS, NO_UPDATES))
    ).toEqual(["listed-last", "listed-first"])
  })

  it("compares dates as instants, not as text", () => {
    // 23:00 at UTC-5 is 04:00 UTC the next day: later than 03:00 UTC, though
    // its string sorts lower.
    const entries = [
      entry("utc", { updatedAt: "2026-09-21T03:00:00Z" }),
      entry("offset", { updatedAt: "2026-09-20T23:00:00-05:00" }),
    ]

    expect(
      ids(sortEntries(entries, "recent", NO_INSTALLATIONS, NO_UPDATES))
    ).toEqual(["offset", "utc"])
  })

  it("sorts an unparseable date last rather than first", () => {
    const entries = [
      entry("unknown", { updatedAt: "whenever", publishedAt: "whenever" }),
      entry("dated", {
        updatedAt: "2026-05-05T00:00:00Z",
        publishedAt: "2026-05-05T00:00:00Z",
      }),
    ]

    expect(
      ids(sortEntries(entries, "recent", NO_INSTALLATIONS, NO_UPDATES))
    ).toEqual(["dated", "unknown"])
    expect(
      ids(sortEntries(entries, "recently-added", NO_INSTALLATIONS, NO_UPDATES))
    ).toEqual(["dated", "unknown"])
  })

  it("sorts A to Z by name, ignoring case and surrounding whitespace", () => {
    const entries = [
      entry("c", { name: "cobalt" }),
      entry("a", { name: "  Amber" }),
      entry("b", { name: "bronze" }),
    ]

    expect(
      ids(sortEntries(entries, "a-z", NO_INSTALLATIONS, NO_UPDATES))
    ).toEqual(["a", "b", "c"])
  })

  it("breaks ties by id in every mode", () => {
    const tied = [
      entry("zeta", { name: "same", installs: 4 }),
      entry("alpha", { name: "same", installs: 4 }),
      entry("mid", { name: "same", installs: 4 }),
    ]

    for (const mode of [
      "updates-first",
      "popular",
      "recent",
      "recently-added",
      "a-z",
    ] as const) {
      expect(
        ids(sortEntries(tied, mode, NO_INSTALLATIONS, NO_UPDATES))
      ).toEqual(["alpha", "mid", "zeta"])
    }
  })

  it("returns a copy and leaves the input order alone", () => {
    const entries = [entry("b"), entry("a")]
    const sorted = sortEntries(entries, "a-z", NO_INSTALLATIONS, NO_UPDATES)

    expect(ids(entries)).toEqual(["b", "a"])
    expect(sorted).not.toBe(entries)
  })
})

describe("directory date badge", () => {
  // A row must report the date it is actually ordered by: showing the listing
  // date under "Recently updated" would explain the wrong ordering.
  it("follows the sort the list is ordered by", () => {
    expect(dateBadgeForSortMode("recent")).toBe("updated")
    expect(dateBadgeForSortMode("recently-added")).toBe("added")
  })

  it("shows no date for sorts that are not ordered by one", () => {
    expect(dateBadgeForSortMode("popular")).toBeUndefined()
    expect(dateBadgeForSortMode("updates-first")).toBeUndefined()
    expect(dateBadgeForSortMode("a-z")).toBeUndefined()
  })
})
