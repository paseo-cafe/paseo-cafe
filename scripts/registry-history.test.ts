import { describe, expect, it } from "vitest"
import { parseAddedDates } from "./registry-history"

const log = (blocks: string[]) => `${blocks.join("\n")}\n`

describe("parseAddedDates", () => {
  it("maps a registry file to the commit that added it", () => {
    expect(
      parseAddedDates(
        log(["2026-09-01T14:45:47+01:00", "", "registry/skills.json"])
      )
    ).toEqual(new Map([["skills", "2026-09-01T13:45:47.000Z"]]))
  })

  it("keeps the earliest commit when a file is added more than once", () => {
    const out = parseAddedDates(
      log([
        "2026-09-01T00:00:00Z",
        "",
        "registry/skills.json",
        "",
        "2026-09-08T00:00:00Z",
        "",
        "registry/skills.json",
      ])
    )
    expect(out.get("skills")).toBe("2026-09-01T00:00:00.000Z")
  })

  it("handles several files added in one commit", () => {
    const out = parseAddedDates(
      log([
        "2026-09-08T11:37:39Z",
        "",
        "registry/agent-crew.json",
        "registry/pr-radar.json",
      ])
    )
    expect(out).toEqual(
      new Map([
        ["agent-crew", "2026-09-08T11:37:39.000Z"],
        ["pr-radar", "2026-09-08T11:37:39.000Z"],
      ])
    )
  })

  it("ignores paths outside registry and non-json files", () => {
    const out = parseAddedDates(
      log([
        "2026-09-08T11:37:39Z",
        "",
        "registry/README.md",
        "src/routes/index.tsx",
        "registry/pr-radar.json",
      ])
    )
    expect(out).toEqual(new Map([["pr-radar", "2026-09-08T11:37:39.000Z"]]))
  })

  it("returns nothing for empty output", () => {
    expect(parseAddedDates("")).toEqual(new Map())
  })
})
