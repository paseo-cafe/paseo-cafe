#!/usr/bin/env bun
import { lstatSync, readdirSync, readFileSync } from "node:fs"
import { isBuiltin } from "node:module"
import { dirname, join, normalize, relative, resolve } from "node:path"
import * as semver from "semver"
import * as ts from "typescript"
import type { SecurityFinding } from "./shared.ts"

export type StaticScanInput = {
  root: string
  pluginPath?: string
  registryId?: string
}
export type StaticScanOutput = {
  files: number
  bytes: number
  findings: SecurityFinding[]
  buildCommands: string[][]
}
const MAX_FILES = 200
const MAX_BYTES = 2_000_000
const MAX_DEPTH = 6
type ScanState = {
  files: number
  bytes: number
  incomplete: boolean
  manifest: boolean
  clientEntry: boolean
  serverEntry: boolean
  legacyEntry: boolean
}

const PLUGIN_ID = /^[a-z][a-z0-9-]*$/
const CODE_MODULE = /\.[cm]?[jt]sx?$/
const RUNTIME_ENTRY = /^index\.(client|server)\.(?:ts|tsx)$/
const LEGACY_ENTRY = /^index\.(?:ts|tsx)$/
const CLIENT_ONLY_SDK: Record<string, true> = {
  "@getpaseo/plugin/client": true,
  "@getpaseo/plugin/client/ui": true,
  "@getpaseo/plugin/client/react-native": true,
}
const SERVER_ONLY_SDK: Record<string, true> = {
  "@getpaseo/plugin/server": true,
  "@getpaseo/plugin/server/provider": true,
  "@getpaseo/plugin/server/acp": true,
}
const SUPPORTED_SDK: Record<string, true> = {
  "@getpaseo/plugin": true,
  ...CLIENT_ONLY_SDK,
  ...SERVER_ONLY_SDK,
}
const CLIENT_ONLY_MODULE =
  /^(?:(?:@types\/)?react(?:-dom|-native)?|use-sync-external-store|@tanstack\/react-query)(?:\/|$)/

export function scanStaticFiles(input: StaticScanInput): StaticScanOutput {
  const root = resolve(input.root, input.pluginPath ?? ".")
  const state: ScanState = {
    files: 0,
    bytes: 0,
    incomplete: false,
    manifest: false,
    clientEntry: false,
    serverEntry: false,
    legacyEntry: false,
  }
  const findings: SecurityFinding[] = []
  const buildCommands: string[][] = []
  walk(root, root, 0, state, findings, buildCommands, input.registryId)
  if (!state.manifest)
    findings.push(
      finding(
        "manifest",
        "missing",
        "high",
        true,
        "paseo-plugin.json",
        "plugin manifest is missing"
      )
    )
  if (!state.clientEntry && !state.serverEntry && !state.legacyEntry)
    findings.push(
      finding(
        "entrypoint",
        "missing",
        "high",
        true,
        ".",
        "plugin has no Paseo 0.8 runtime entry"
      )
    )
  if (state.incomplete)
    findings.push(
      finding(
        "scanner",
        "incomplete",
        "high",
        true,
        ".",
        "scan exceeded limits or encountered unsupported filesystem state"
      )
    )
  return { files: state.files, bytes: state.bytes, findings, buildCommands }
}

function walk(
  base: string,
  dir: string,
  depth: number,
  state: ScanState,
  findings: SecurityFinding[],
  buildCommands: string[][],
  registryId?: string
) {
  if (depth > MAX_DEPTH) {
    state.incomplete = true
    return
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(base, full) || entry.name
    if (entry.isDirectory() && entry.name === ".git") continue
    if (entry.isSymbolicLink()) {
      state.incomplete = true
      findings.push(
        finding("scanner", "symlink", "high", true, rel, "symlink rejected")
      )
      continue
    }
    const meta = lstatSync(full)
    if (meta.size > MAX_BYTES) {
      state.incomplete = true
      findings.push(
        finding(
          "scanner",
          "size-limit",
          "high",
          true,
          rel,
          "file exceeds size budget"
        )
      )
      continue
    }
    if (entry.isDirectory()) {
      walk(base, full, depth + 1, state, findings, buildCommands, registryId)
      continue
    }
    if (!entry.isFile()) continue
    state.files += 1
    if (state.files > MAX_FILES) state.incomplete = true
    const content = readFileSync(full, "utf8")
    state.bytes += meta.size
    if (state.bytes > MAX_BYTES) state.incomplete = true
    if (rel === "paseo-plugin.json") {
      state.manifest = true
      validateManifest(content, rel, registryId, findings, buildCommands)
    }
    const entryMatch = RUNTIME_ENTRY.exec(rel)
    if (entryMatch?.[1] === "client") state.clientEntry = true
    if (entryMatch?.[1] === "server") state.serverEntry = true
    if (LEGACY_ENTRY.test(rel)) {
      state.legacyEntry = true
      validateEntrypoint(entry.name, rel, findings)
    }
    scanBoundaries(content, rel, findings)
  }
}

function validateManifest(
  raw: string,
  path: string,
  registryId: string | undefined,
  findings: SecurityFinding[],
  buildCommands: string[][]
) {
  try {
    const value = JSON.parse(raw) as unknown
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("manifest must be an object")
    const parsed = value as Record<string, unknown>
    if (
      typeof parsed.id !== "string" ||
      !PLUGIN_ID.test(parsed.id) ||
      (registryId !== undefined && parsed.id !== registryId)
    )
      findings.push(
        finding(
          "manifest",
          "id",
          "high",
          true,
          path,
          "manifest id must be lowercase kebab-case and match registry id"
        )
      )
    const req = parsed.requirements
    if (req === undefined) {
      findings.push(
        finding(
          "manifest",
          "requirements.paseo",
          "high",
          true,
          path,
          "requirements.paseo is required for Paseo 0.8 plugins"
        )
      )
    } else if (!req || typeof req !== "object" || Array.isArray(req)) {
      findings.push(
        finding(
          "manifest",
          "requirements",
          "high",
          true,
          path,
          "requirements must be an object"
        )
      )
    } else {
      const requirements = req as Record<string, unknown>
      for (const key of Object.keys(requirements))
        if (key !== "paseo")
          findings.push(
            finding(
              "manifest",
              "requirements.unknown",
              "high",
              true,
              path,
              `unknown manifest requirement ${key}`
            )
          )
      const paseo = requirements.paseo
      const range =
        typeof paseo === "string" && paseo.trim().length > 0
          ? semver.validRange(paseo, { loose: false })
          : null
      if (!range || !semver.intersects(range, ">=0.8.0"))
        findings.push(
          finding(
            "manifest",
            "requirements.paseo",
            "high",
            true,
            path,
            "requirements.paseo must be a valid range targeting Paseo 0.8 or newer"
          )
        )
    }
    if (parsed.build !== undefined) {
      if (
        !Array.isArray(parsed.build) ||
        parsed.build.length === 0 ||
        !parsed.build.every(
          (cmd) =>
            Array.isArray(cmd) &&
            cmd.length > 0 &&
            cmd.every((arg) => typeof arg === "string" && arg.trim().length > 0)
        )
      )
        findings.push(
          finding(
            "manifest",
            "build",
            "high",
            true,
            path,
            "build must be nonempty argv arrays"
          )
        )
      else for (const cmd of parsed.build as string[][]) buildCommands.push(cmd)
    }
    for (const key of Object.keys(parsed))
      if (!["id", "requirements", "build"].includes(key))
        findings.push(
          finding(
            "manifest",
            `unknown:${key}`,
            "high",
            true,
            path,
            `unknown manifest key ${key}`
          )
        )
  } catch {
    findings.push(
      finding("manifest", "json", "high", true, path, "invalid JSON manifest")
    )
  }
}
function validateEntrypoint(
  name: string,
  path: string,
  findings: SecurityFinding[]
) {
  if (name === "index.ts" || name === "index.tsx")
    findings.push(
      finding(
        "entrypoint",
        "legacy-index",
        "high",
        true,
        path,
        "legacy-only index.ts is rejected"
      )
    )
}
type PluginRuntime = "client" | "server" | "shared"
type PluginModuleLocation = PluginRuntime | "invalid"

function runtimeForPath(path: string): PluginModuleLocation | null {
  const parts = path.split(/[\\/]/)
  if (parts[0] === "..") return "invalid"
  const directory = parts.length > 1 ? parts[0] : undefined
  if (directory === "node_modules") return null
  if (
    directory === "client" ||
    directory === "server" ||
    directory === "shared"
  )
    return directory

  const filename = parts.at(-1)
  if (parts.length === 1 && /^index\.client\.(?:ts|tsx)$/.test(filename ?? ""))
    return "client"
  if (parts.length === 1 && /^index\.server\.(?:ts|tsx)$/.test(filename ?? ""))
    return "server"
  return "invalid"
}

function importedLocation(
  path: string,
  specifier: string
): PluginModuleLocation | null {
  if (!specifier.startsWith(".")) return null
  return runtimeForPath(normalize(join(dirname(path), specifier)))
}

function crossesRuntimeBoundary(
  source: PluginRuntime,
  target: PluginRuntime
): boolean {
  if (source === "shared") return target !== "shared"
  if (source === "client") return target === "server"
  return target === "client"
}

function runtimeSpecifierViolation(
  source: PluginRuntime,
  specifier: string
): "unsupported-sdk-import" | "runtime-module-import" | null {
  if (
    (specifier === "@getpaseo/plugin" ||
      specifier.startsWith("@getpaseo/plugin/") ||
      specifier === "@paseo/plugin" ||
      specifier.startsWith("@paseo/plugin/")) &&
    !SUPPORTED_SDK[specifier]
  )
    return "unsupported-sdk-import"
  if (
    source !== "server" &&
    (isBuiltin(specifier) || specifier === "@types/node")
  )
    return "runtime-module-import"
  if (source !== "server" && SERVER_ONLY_SDK[specifier])
    return "runtime-module-import"
  if (
    source !== "client" &&
    (CLIENT_ONLY_SDK[specifier] || CLIENT_ONLY_MODULE.test(specifier))
  )
    return "runtime-module-import"
  return null
}

function scanBoundaries(
  content: string,
  path: string,
  findings: SecurityFinding[]
) {
  if (!CODE_MODULE.test(path)) return
  const location = runtimeForPath(path)
  if (!location || location === "invalid") return

  const imports = ts.preProcessFile(content, true, true)
  const specifiers = [
    ...imports.importedFiles.map(({ fileName }) => fileName),
    ...imports.typeReferenceDirectives.map(
      ({ fileName }) =>
        `@types/${fileName.replace(/^@/, "").replace("/", "__")}`
    ),
  ]
  for (const specifier of specifiers) {
    const ruleId = runtimeSpecifierViolation(location, specifier)
    if (ruleId) {
      findings.push(
        finding(
          "boundary",
          ruleId,
          "high",
          true,
          path,
          `${specifier} cannot be imported from ${location} code`
        )
      )
      continue
    }
    const target = importedLocation(path, specifier)
    if (target === "invalid")
      findings.push(
        finding(
          "boundary",
          "invalid-module-location",
          "high",
          true,
          path,
          `plugin module import must stay under client/, server/, or shared/: ${specifier}`
        )
      )
    else if (target && crossesRuntimeBoundary(location, target))
      findings.push(
        finding(
          "boundary",
          "cross-runtime-import",
          "high",
          true,
          path,
          `${location} code cannot import ${target} code: ${specifier}`
        )
      )
  }
}
function finding(
  tool: string,
  ruleId: string,
  severity: string,
  blocking: boolean,
  path: string,
  message: string
): SecurityFinding {
  return { tool, ruleId, severity, blocking, path, message }
}
