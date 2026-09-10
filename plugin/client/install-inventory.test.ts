import { describe, expect, it } from "vitest"
import type { InstalledPlugin } from "../shared/directory"
import {
  claimObservedInstall,
  observeCatalogPlugins,
  reconcileCatalogPlugins,
} from "./install-inventory"

const entries = [
  { id: "alpha", repo: "owner/alpha" },
  { id: "beta", repo: "owner/beta", path: "plugin" },
]
const catalogIds = entries.map(({ id }) => id)

function installed(
  id: string,
  remote: string,
  commit?: string,
  path = "/tmp/plugin"
): InstalledPlugin {
  return {
    id,
    path,
    enabled: true,
    status: "running",
    source: "git",
    remote,
    ref: "main",
    commit,
    updateState: "unknown",
  }
}

describe("catalog lifecycle reconciliation", () => {
  it("reports already-installed catalog plugins once", () => {
    const current = observeCatalogPlugins(entries, [
      installed("custom-alpha", "https://github.com/owner/alpha.git", "aaa"),
    ])

    expect(current).toEqual({ alpha: "git:aaa" })
    expect(reconcileCatalogPlugins({}, current, catalogIds)).toEqual({
      events: [{ pluginId: "alpha", event: "install" }],
      observed: current,
    })
    expect(reconcileCatalogPlugins(current, current, catalogIds)).toEqual({
      events: [],
      observed: current,
    })
  })

  it("reports updates and removals without exposing local paths", () => {
    const previous = { alpha: "git:aaa", beta: "git:bbb" }
    const current = observeCatalogPlugins(entries, [
      installed(
        "alpha",
        "git@github.com:owner/alpha.git",
        "ccc",
        "/secret/path"
      ),
    ])

    expect(current).toEqual({ alpha: "git:ccc" })
    expect(JSON.stringify(current)).not.toContain("/secret/path")
    expect(reconcileCatalogPlugins(previous, current, catalogIds)).toEqual({
      events: [
        { pluginId: "alpha", event: "update" },
        { pluginId: "beta", event: "uninstall" },
      ],
      observed: current,
    })
  })

  it("preserves observations removed from the catalog", () => {
    const previous = { alpha: "git:aaa", beta: "git:bbb" }
    const current = { alpha: "git:aaa" }

    expect(reconcileCatalogPlugins(previous, current, ["alpha"])).toEqual({
      events: [],
      observed: previous,
    })
  })

  it("does not persist or claim non-reportable catalog IDs", () => {
    const current = observeCatalogPlugins(
      [{ id: "Bad Plugin", repo: "owner/alpha" }],
      [installed("Bad Plugin", "https://github.com/owner/alpha.git", "aaa")]
    )

    expect(current).toEqual({})
    expect(claimObservedInstall({}, "Bad Plugin")).toEqual({
      claimed: false,
      observed: {},
    })
  })

  it("lets only one path claim a new direct install", () => {
    expect(claimObservedInstall({}, "alpha")).toEqual({
      claimed: true,
      observed: { alpha: "pending" },
    })
    const existing = { alpha: "git:aaa" }
    expect(claimObservedInstall(existing, "alpha")).toEqual({
      claimed: false,
      observed: existing,
    })
  })

  it("absorbs a just-reported install without emitting an update", () => {
    expect(
      reconcileCatalogPlugins(
        { alpha: "pending" },
        { alpha: "git:aaa" },
        catalogIds
      )
    ).toEqual({ events: [], observed: { alpha: "git:aaa" } })
  })
})
