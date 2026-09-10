import { describe, expect, it } from "vitest"
import type { PluginRecord } from "./plugin-schema"
import { sortPlugins } from "./sort-plugins"

function plugin(id: string, extra: Partial<PluginRecord> = {}): PluginRecord {
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
    scannedAt: "2026-09-09T00:00:00.000Z",
    ...extra,
  }
}

const owner = (login: string): Pick<PluginRecord, "owner"> => ({
  owner: {
    login,
    avatarUrl: `https://avatars.githubusercontent.com/${login}`,
    url: `https://github.com/${login}`,
  },
})

const ids = (plugins: PluginRecord[]) => plugins.map((p) => p.id)

describe("sortPlugins", () => {
  it("sorts by name", () => {
    const plugins = [plugin("zcode"), plugin("agent"), plugin("mid")]
    expect(ids(sortPlugins(plugins, "name"))).toEqual(["agent", "mid", "zcode"])
  })

  it("sorts by repo owner, grouping each author's plugins together", () => {
    const plugins = [
      plugin("b", owner("zoe")),
      plugin("c", owner("adam")),
      plugin("a", owner("zoe")),
    ]
    expect(ids(sortPlugins(plugins, "author"))).toEqual(["c", "a", "b"])
  })

  it("falls back to package.json author, then repo, when there is no owner", () => {
    const plugins = [
      plugin("no-owner", { author: "Zoe" }),
      plugin("has-owner", owner("adam")),
    ]
    expect(ids(sortPlugins(plugins, "author"))).toEqual([
      "has-owner",
      "no-owner",
    ])
  })

  it("sorts by added date, newest first", () => {
    const plugins = [
      plugin("older", { addedAt: "2026-09-01T00:00:00.000Z" }),
      plugin("newest", { addedAt: "2026-09-09T00:00:00.000Z" }),
      plugin("middle", { addedAt: "2026-09-05T00:00:00.000Z" }),
    ]
    expect(ids(sortPlugins(plugins, "added"))).toEqual([
      "newest",
      "middle",
      "older",
    ])
  })

  it("sorts by updated date, newest first", () => {
    const plugins = [
      plugin("stale", { updatedAt: "2026-08-01T00:00:00.000Z" }),
      plugin("fresh", { updatedAt: "2026-09-09T00:00:00.000Z" }),
    ]
    expect(ids(sortPlugins(plugins, "updated"))).toEqual(["fresh", "stale"])
  })

  it("puts undated records last instead of treating them as ancient", () => {
    const plugins = [
      plugin("undated"),
      plugin("dated", { updatedAt: "2026-08-01T00:00:00.000Z" }),
      plugin("unparseable", { updatedAt: "sometime last year" }),
    ]
    expect(ids(sortPlugins(plugins, "updated"))).toEqual([
      "dated",
      "undated",
      "unparseable",
    ])
  })

  it("breaks ties by name so the order is stable", () => {
    const sameDay = { addedAt: "2026-09-08T00:00:00.000Z" }
    const plugins = [
      plugin("c", sameDay),
      plugin("a", sameDay),
      plugin("b", sameDay),
    ]
    expect(ids(sortPlugins(plugins, "added"))).toEqual(["a", "b", "c"])
  })

  it("never reorders the array it was given", () => {
    const plugins = [plugin("z"), plugin("a")]
    sortPlugins(plugins, "name")
    expect(ids(plugins)).toEqual(["z", "a"])
  })
})
