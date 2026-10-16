import { describe, expect, it } from "vitest"
import type { PluginUpdate } from "../shared/directory"
import { getDetailPrimaryAction } from "./detail-action"

const update = (outcome: PluginUpdate["outcome"]) => ({ outcome })
const base = { inventoryAvailable: true, installable: true }

describe("detail page primary action", () => {
  it("offers install when nothing is installed", () => {
    expect(
      getDetailPrimaryAction({
        ...base,
        installations: [],
        updates: new Map(),
      })
    ).toEqual({ kind: "install" })
  })

  it("offers nothing when installing is impossible", () => {
    expect(
      getDetailPrimaryAction({
        installable: true,
        inventoryAvailable: false,
        installations: [],
        updates: new Map(),
      })
    ).toBeUndefined()
    expect(
      getDetailPrimaryAction({
        installable: false,
        inventoryAvailable: true,
        installations: [],
        updates: new Map(),
      })
    ).toBeUndefined()
  })

  it("shows a settled installation as installed", () => {
    expect(
      getDetailPrimaryAction({
        ...base,
        installations: [{ id: "a" }],
        updates: new Map([["a", update("current")]]),
      })
    ).toEqual({ kind: "installed" })
  })

  it("prefers an update over installed and acts on the first updatable installation", () => {
    const installations = [{ id: "a" }, { id: "b" }, { id: "c" }]
    expect(
      getDetailPrimaryAction({
        ...base,
        installations,
        updates: new Map([
          ["a", update("current")],
          ["b", update("update")],
          ["c", update("update")],
        ]),
      })
    ).toEqual({ kind: "update", target: { id: "b" }, count: 2 })
  })

  it("ignores update failures and keeps showing installed", () => {
    expect(
      getDetailPrimaryAction({
        ...base,
        installations: [{ id: "a" }],
        updates: new Map([["a", update("error")]]),
      })
    ).toEqual({ kind: "installed" })
  })
})
