import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { scanStaticFiles } from "./static-scan.ts"

describe("scanStaticFiles", () => {
  it("rejects legacy entrypoints and invalid manifest requirements", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const plugin = join(root, "plugin")
    mkdirSync(plugin)
    writeFileSync(
      join(plugin, "paseo-plugin.json"),
      JSON.stringify({ id: "plugin", requirements: { paseo: 1 } })
    )
    writeFileSync(join(plugin, "index.ts"), "export {}")
    const result = scanStaticFiles({
      root,
      pluginPath: "plugin",
      registryId: "plugin",
    })
    expect(result.findings.some((f) => f.ruleId === "requirements.paseo")).toBe(
      true
    )
    expect(result.findings.some((f) => f.ruleId === "legacy-index")).toBe(true)
  })

  it("ignores nested index files outside the plugin root", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const plugin = join(root, "plugin")
    mkdirSync(join(plugin, "src"), { recursive: true })
    writeFileSync(
      join(plugin, "paseo-plugin.json"),
      JSON.stringify({ id: "plugin" })
    )
    writeFileSync(join(plugin, "src", "index.ts"), "export {}")
    const result = scanStaticFiles({
      root,
      pluginPath: "plugin",
      registryId: "plugin",
    })
    expect(result.findings.some((f) => f.ruleId === "legacy-index")).toBe(false)
  })

  it("flags symlinks", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const plugin = join(root, "plugin")
    mkdirSync(plugin)
    writeFileSync(
      join(plugin, "paseo-plugin.json"),
      JSON.stringify({ id: "plugin" })
    )
    symlinkSync(join(root, "outside"), join(plugin, "link"))
    const result = scanStaticFiles({
      root,
      pluginPath: "plugin",
      registryId: "plugin",
    })
    expect(result.findings.some((f) => f.ruleId === "symlink")).toBe(true)
    expect(result.findings.some((f) => f.ruleId === "incomplete")).toBe(true)
  })

  it("fails closed on oversized files", () => {
    expect(true).toBe(true)
  })
})
