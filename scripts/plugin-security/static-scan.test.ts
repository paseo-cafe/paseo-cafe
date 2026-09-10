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
  it("enforces the strict manifest shape and runtime entry requirement", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    writeFileSync(
      join(root, "paseo-plugin.json"),
      JSON.stringify({
        id: "Plugin",
        requirements: { paseo: " ", node: ">=20" },
        build: [["bun", " "]],
        extra: true,
      })
    )

    const result = scanStaticFiles({ root, registryId: "plugin" })
    const rules = result.findings.map(
      ({ tool, ruleId, blocking }) => `${tool}/${ruleId}:${blocking}`
    )

    expect(rules).toEqual([
      "manifest/id:true",
      "manifest/requirements.unknown:true",
      "manifest/requirements.paseo:true",
      "manifest/build:true",
      "manifest/unknown:extra:true",
      "entrypoint/missing:true",
    ])
  })

  it("rejects requirements that only target pre-0.8 Paseo", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    writeFileSync(
      join(root, "paseo-plugin.json"),
      JSON.stringify({ id: "plugin", requirements: { paseo: "<0.8.0" } })
    )
    writeFileSync(
      join(root, "index.server.ts"),
      "export default () => () => {}"
    )
    expect(
      scanStaticFiles({ root, registryId: "plugin" }).findings.some(
        ({ ruleId }) => ruleId === "requirements.paseo"
      )
    ).toBe(true)
  })

  it("requires a manifest and recognizes legacy TSX entrypoints", () => {
    const missing = mkdtempSync(join(tmpdir(), "plugin-security-"))
    expect(
      scanStaticFiles({ root: missing }).findings.map(
        ({ tool, ruleId }) => `${tool}/${ruleId}`
      )
    ).toEqual(["manifest/missing", "entrypoint/missing"])

    const legacy = mkdtempSync(join(tmpdir(), "plugin-security-"))
    writeFileSync(join(legacy, "index.tsx"), "export default () => () => {}")
    expect(
      scanStaticFiles({ root: legacy }).findings.map(
        ({ tool, ruleId }) => `${tool}/${ruleId}`
      )
    ).toEqual(["entrypoint/legacy-index", "manifest/missing"])
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
  it("enforces SDK and host-module runtime ownership", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    mkdirSync(join(root, "client"))
    mkdirSync(join(root, "server"))
    mkdirSync(join(root, "shared"))
    writeFileSync(
      join(root, "paseo-plugin.json"),
      JSON.stringify({ id: "plugin", requirements: { paseo: ">=0.8.0" } })
    )
    writeFileSync(
      join(root, "index.client.ts"),
      'import "node:fs"\nimport "@getpaseo/plugin/server"\nimport "./helper"'
    )
    writeFileSync(join(root, "helper.ts"), "export {}")
    writeFileSync(join(root, "index.server.ts"), 'import "react"')
    writeFileSync(
      join(root, "shared", "contract.ts"),
      'import type { PluginClientContext } from "@getpaseo/plugin/client"'
    )
    writeFileSync(
      join(root, "client", "private.ts"),
      'import "@getpaseo/plugin/client/host"'
    )

    const result = scanStaticFiles({ root, registryId: "plugin" })
    const findings = result.findings.map(
      ({ ruleId, path }) => `${ruleId}:${path}`
    )

    expect(findings).toEqual([
      "unsupported-sdk-import:client/private.ts",
      "runtime-module-import:index.client.ts",
      "runtime-module-import:index.client.ts",
      "invalid-module-location:index.client.ts",
      "runtime-module-import:index.server.ts",
      "runtime-module-import:shared/contract.ts",
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

  it("excludes Git metadata from coverage", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    mkdirSync(join(root, ".git", "objects"), { recursive: true })
    const manifest = JSON.stringify({
      id: "plugin",
      requirements: { paseo: ">=0.8.0" },
    })
    const entrypoint = "export default () => () => {}"
    writeFileSync(join(root, "paseo-plugin.json"), manifest)
    writeFileSync(join(root, "index.server.ts"), entrypoint)
    writeFileSync(
      join(root, ".git", "objects", "pack"),
      Buffer.alloc(2_000_001)
    )

    const result = scanStaticFiles({ root, registryId: "plugin" })

    expect(result.files).toBe(2)
    expect(result.bytes).toBe(
      Buffer.byteLength(manifest) + Buffer.byteLength(entrypoint)
    )
    expect(result.findings).toEqual([])
  })

  it("counts binary files by their on-disk size", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const binary = Buffer.from([0xff, 0xfe])
    writeFileSync(join(root, "artifact.bin"), binary)

    const result = scanStaticFiles({ root })

    expect(result.files).toBe(1)
    expect(result.bytes).toBe(binary.byteLength)
  })

  it("fails closed on oversized files", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    writeFileSync(join(root, "artifact.bin"), Buffer.alloc(2_000_001))

    const result = scanStaticFiles({ root })

    expect(result.findings.some((f) => f.ruleId === "size-limit")).toBe(true)
    expect(result.findings.some((f) => f.ruleId === "incomplete")).toBe(true)
  })
})
