import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { selectTargets } from "./targets.ts"

describe("selectTargets", () => {
  it("reads registry entries and PR head sha", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const registry = join(root, "registry")
    mkdirSync(registry)
    writeFileSync(join(registry, "demo.json"), JSON.stringify({ id: "demo", repo: "owner/repo" }))
    const event = join(root, "event.json")
    writeFileSync(event, JSON.stringify({ pull_request: { head: { sha: "abc123" } } }))
    expect(selectTargets({ registryRoot: registry, eventPath: event })).toEqual([
      { id: "demo", repo: "owner/repo", ref: "abc123", commit: "abc123", path: undefined },
    ])
  })
})
