#!/usr/bin/env bun
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs"
import { isBuiltin } from "node:module"
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
  win32,
} from "node:path"
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
  legacyEntry: string | null
  realBase: string
  sources: Map<string, string | undefined>
}

const PLUGIN_ID = /^[a-z][a-z0-9-]*$/
const CODE_MODULE = /\.[cm]?[jt]sx?$/
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
type ImportResolver = (
  specifier: string,
  importer: string
) => string | undefined

function createImportResolver(directory: string): ImportResolver {
  const configFile = ts.findConfigFile(directory, ts.sys.fileExists)
  const config = configFile
    ? ts.getParsedCommandLineOfConfigFile(
        configFile,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic(diagnostic) {
            throw new Error(
              ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
            )
          },
        }
      )
    : undefined
  const options = {
    ...config?.options,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
  }
  const cache = ts.createModuleResolutionCache(
    directory,
    (file) => file,
    options
  )
  return (specifier, importer) => {
    const resolvedModule = ts.resolveModuleName(
      specifier,
      importer,
      options,
      ts.sys,
      cache
    ).resolvedModule
    return resolvedModule?.resolvedFileName
  }
}

/**
 * Scans exactly what Paseo can compile from the plugin manifest and runtime
 * entrypoints. Unreachable tests, documentation, and media are not executable
 * plugin inputs and must not consume the scanner's bounded file budget.
 */
export function scanStaticFiles(input: StaticScanInput): StaticScanOutput {
  const root = resolve(input.root, input.pluginPath ?? ".")
  const state: ScanState = {
    files: 0,
    bytes: 0,
    realBase: realpathSync(root),
    incomplete: false,
    manifest: false,
    clientEntry: false,
    serverEntry: false,
    legacyEntry: null,
    sources: new Map(),
  }
  const findings: SecurityFinding[] = []
  const buildCommands: string[][] = []
  const manifestPath = "paseo-plugin.json"
  if (existsSync(join(root, manifestPath))) {
    state.manifest = true
    const manifest = readScannedFile(root, manifestPath, state, findings)
    if (manifest !== undefined)
      validateManifest(
        manifest,
        manifestPath,
        input.registryId,
        findings,
        buildCommands
      )
  }

  const entrypoints = [
    "index.client.ts",
    "index.client.tsx",
    "index.server.ts",
    "index.server.tsx",
  ].filter((path) => existsSync(join(root, path)))
  state.clientEntry = entrypoints.some((path) =>
    path.startsWith("index.client")
  )
  state.serverEntry = entrypoints.some((path) =>
    path.startsWith("index.server")
  )
  state.legacyEntry =
    ["index.ts", "index.tsx"].find((path) => existsSync(join(root, path))) ??
    null

  const resolveImport = createImportResolver(root)
  const checkedImports = new Set<string>()
  for (const path of entrypoints)
    scanBoundaries(path, root, resolveImport, findings, state, checkedImports)

  if (!state.manifest)
    findings.push(
      finding(
        "manifest",
        "missing",
        "high",
        true,
        manifestPath,
        "plugin manifest is missing"
      )
    )
  if (!state.clientEntry && !state.serverEntry) {
    if (state.legacyEntry)
      findings.push(
        finding(
          "entrypoint",
          "legacy-index",
          "high",
          true,
          state.legacyEntry,
          "legacy-only index.ts or index.tsx is rejected"
        )
      )
    else
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
  }
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

function readScannedFile(
  base: string,
  path: string,
  state: ScanState,
  findings: SecurityFinding[]
): string | undefined {
  if (state.sources.has(path)) return state.sources.get(path)
  state.sources.set(path, undefined)

  const full = resolve(base, path)
  if (!containsPath(base, full) || path.split(/[\\/]/).length - 1 > MAX_DEPTH) {
    state.incomplete = true
    return undefined
  }
  try {
    const meta = lstatSync(full)
    if (
      meta.isSymbolicLink() ||
      realpathSync(full) !== resolve(state.realBase, path)
    ) {
      state.incomplete = true
      findings.push(
        finding("scanner", "symlink", "high", true, path, "symlink rejected")
      )
      return undefined
    }
    if (!meta.isFile()) {
      state.incomplete = true
      return undefined
    }
    if (meta.size > MAX_BYTES) {
      state.incomplete = true
      findings.push(
        finding(
          "scanner",
          "size-limit",
          "high",
          true,
          path,
          "file exceeds size budget"
        )
      )
      return undefined
    }
    if (state.files >= MAX_FILES || state.bytes + meta.size > MAX_BYTES) {
      state.incomplete = true
      return undefined
    }
    const content = readFileSync(full, "utf8")
    state.files += 1
    state.bytes += meta.size
    state.sources.set(path, content)
    return content
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      state.incomplete = true
    return undefined
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
type PluginRuntime = "client" | "server" | "shared"
type PluginModuleLocation = PluginRuntime | "invalid"

function runtimeOwnerForPath(path: string): PluginRuntime | null {
  const parts = path.split(/[\\/]/)
  const directory = parts[0]
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
  return null
}

function runtimeForPath(path: string): PluginModuleLocation | null {
  const parts = path.split(/[\\/]/)
  if (parts[0] === "..") return "invalid"
  if (parts.includes("node_modules")) return null
  return runtimeOwnerForPath(path) ?? "invalid"
}

function containsPath(directory: string, path: string): boolean {
  const nested = relative(directory, path)
  return nested === "" || (!nested.startsWith("..") && !isAbsolute(nested))
}

function dependencyName(specifier: string): string {
  const segments = specifier.split("/")
  return specifier.startsWith("@")
    ? segments.slice(0, 2).join("/")
    : segments[0]
}

function isExternalDependency(
  base: string,
  specifier: string,
  resolvedPath: string
): boolean {
  const expectedName = dependencyName(specifier)
  for (
    let directory = dirname(resolvedPath);
    ;
    directory = dirname(directory)
  ) {
    const manifestPath = join(directory, "package.json")
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          name?: unknown
        }
        if (manifest.name === expectedName)
          return (
            !containsPath(base, directory) && !containsPath(directory, base)
          )
      } catch {
        return false
      }
    }
    const parent = dirname(directory)
    if (parent === directory) return false
  }
}

type ImportedModule = {
  location: PluginModuleLocation | null
  path?: string
}

function importedModule(
  base: string,
  path: string,
  specifier: string,
  resolveImport: ImportResolver
): ImportedModule {
  if (win32.isAbsolute(specifier) && !isAbsolute(specifier))
    return { location: "invalid" }
  const resolvedImport = specifier.startsWith(".")
    ? resolveImport(specifier, resolve(base, path))
    : isAbsolute(specifier)
      ? specifier
      : resolveImport(specifier, resolve(base, path))
  const importedPath = resolvedImport
    ? relative(base, resolvedImport)
    : specifier.startsWith(".")
      ? normalize(join(dirname(path), specifier))
      : undefined
  if (!importedPath) return { location: null }
  const location = runtimeForPath(importedPath)
  if (
    location === "invalid" &&
    !specifier.startsWith(".") &&
    !isAbsolute(specifier) &&
    resolvedImport &&
    isExternalDependency(base, specifier, resolvedImport)
  )
    return { location: null }
  return { location, path: importedPath }
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
    !Object.hasOwn(SUPPORTED_SDK, specifier)
  )
    return "unsupported-sdk-import"
  if (
    source !== "server" &&
    (isBuiltin(specifier) || specifier === "@types/node")
  )
    return "runtime-module-import"
  if (source !== "server" && Object.hasOwn(SERVER_ONLY_SDK, specifier))
    return "runtime-module-import"
  if (
    source !== "client" &&
    (Object.hasOwn(CLIENT_ONLY_SDK, specifier) ||
      CLIENT_ONLY_MODULE.test(specifier))
  )
    return "runtime-module-import"
  return null
}

function isHostProvidedModule(specifier: string): boolean {
  return (
    Object.hasOwn(SUPPORTED_SDK, specifier) ||
    /^(?:zod|react|react-native|@tanstack\/react-query)(?:\/|$)/.test(
      specifier
    ) ||
    isBuiltin(specifier) ||
    specifier === "@types/node"
  )
}

function scanBoundaries(
  path: string,
  base: string,
  resolveImport: ImportResolver,
  findings: SecurityFinding[],
  state: ScanState,
  checked: Set<string>,
  inheritedOwner?: PluginRuntime
) {
  if (!CODE_MODULE.test(path)) return
  const location = runtimeForPath(path)
  if (location === "invalid") return
  const owner = location ?? inheritedOwner ?? runtimeOwnerForPath(path)
  if (!owner) return
  const visitKey = `${owner}:${path}`
  if (checked.has(visitKey)) return
  checked.add(visitKey)

  const content = readScannedFile(base, path, state, findings)
  if (content === undefined) return
  const imports = ts.preProcessFile(content, true, true)
  const specifiers = [
    ...imports.importedFiles.map(({ fileName }) => fileName),
    ...imports.referencedFiles.map(({ fileName }) =>
      fileName.startsWith(".") ||
      isAbsolute(fileName) ||
      win32.isAbsolute(fileName)
        ? fileName
        : `./${fileName}`
    ),
    ...imports.typeReferenceDirectives.flatMap(({ fileName }) => [
      fileName,
      `@types/${fileName.replace(/^@/, "").replace("/", "__")}`,
    ]),
  ]
  for (const specifier of specifiers) {
    const ruleId = runtimeSpecifierViolation(owner, specifier)
    if (ruleId) {
      findings.push(
        finding(
          "boundary",
          ruleId,
          "high",
          true,
          path,
          `${specifier} cannot be imported from ${owner} code`
        )
      )
      continue
    }
    if (isHostProvidedModule(specifier)) continue
    const imported = importedModule(base, path, specifier, resolveImport)
    if (imported.location === "invalid")
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
    else if (
      imported.location &&
      crossesRuntimeBoundary(owner, imported.location)
    )
      findings.push(
        finding(
          "boundary",
          "cross-runtime-import",
          "high",
          true,
          path,
          `${owner} code cannot import ${imported.location} code: ${specifier}`
        )
      )
    if (imported.location !== "invalid" && imported.path)
      scanBoundaries(
        imported.path,
        base,
        resolveImport,
        findings,
        state,
        checked,
        owner
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
