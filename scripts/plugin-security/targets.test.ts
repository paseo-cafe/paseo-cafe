import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { selectTargets } from "./targets.ts"

describe("selectTargets", () => {
  it("selects checked-out registry entries for non-pr runs", async () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const registry = join(root, "registry")
    mkdirSync(registry)
    writeFileSync(
      join(registry, "one.json"),
      JSON.stringify({ id: "one", repo: "o/r" })
    )
    expect(await selectTargets({ registryRoot: registry })).toEqual([
      { id: "one", repo: "o/r", ref: "HEAD", commit: "HEAD", path: undefined },
    ])
  })
})
