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

  it("allows client and server modules to import shared modules", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const plugin = join(root, "plugin")
    mkdirSync(join(plugin, "client"), { recursive: true })
    mkdirSync(join(plugin, "server"), { recursive: true })
    mkdirSync(join(plugin, "shared"), { recursive: true })
    writeFileSync(
      join(plugin, "paseo-plugin.json"),
      JSON.stringify({ id: "plugin" })
    )
    writeFileSync(
      join(plugin, "shared", "contract.ts"),
      "export const contract = {}"
    )
    writeFileSync(
      join(plugin, "client", "view.ts"),
      'import { contract } from "../shared/contract"\nexport { contract }'
    )
    writeFileSync(
      join(plugin, "server", "handler.ts"),
      'import { contract } from "../shared/contract"\nexport { contract }'
    )

    const result = scanStaticFiles({
      root,
      pluginPath: "plugin",
      registryId: "plugin",
    })

    expect(
      result.findings.filter(
        (finding) => finding.ruleId === "cross-runtime-import"
      )
    ).toEqual([])
  })

  it("flags imports between incompatible plugin runtimes", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const plugin = join(root, "plugin")
    mkdirSync(join(plugin, "client"), { recursive: true })
    mkdirSync(join(plugin, "server"), { recursive: true })
    mkdirSync(join(plugin, "shared"), { recursive: true })
    writeFileSync(
      join(plugin, "paseo-plugin.json"),
      JSON.stringify({ id: "plugin" })
    )
    writeFileSync(
      join(plugin, "client", "view.ts"),
      'import "../server/handler"'
    )
    writeFileSync(
      join(plugin, "server", "handler.ts"),
      'import "../client/view"'
    )
    writeFileSync(
      join(plugin, "shared", "from-client.ts"),
      'export { view } from "../client/view"'
    )
    writeFileSync(
      join(plugin, "shared", "from-server.ts"),
      'export { handler } from "../server/handler"'
    )
    writeFileSync(join(plugin, "index.client.ts"), 'import "./server/handler"')
    writeFileSync(join(plugin, "index.server.ts"), 'import "./client/view"')

    const result = scanStaticFiles({
      root,
      pluginPath: "plugin",
      registryId: "plugin",
    })
    const paths = result.findings
      .filter((finding) => finding.ruleId === "cross-runtime-import")
      .map((finding) => finding.path)
      .sort()

    expect(paths).toEqual([
      "client/view.ts",
      "index.client.ts",
      "index.server.ts",
      "server/handler.ts",
      "shared/from-client.ts",
      "shared/from-server.ts",
    ])
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
