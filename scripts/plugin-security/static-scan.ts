#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import semver from "semver"
import type { SecurityFinding } from "./shared.ts"

export type StaticScanInput = { root: string; pluginPath?: string; registryId?: string }
export type StaticScanOutput = { files: number; bytes: number; findings: SecurityFinding[]; buildCommands: string[][] }
const MAX_FILES = 200, MAX_BYTES = 2_000_000, MAX_DEPTH = 6

export function scanStaticFiles(input: StaticScanInput): StaticScanOutput {
  const root = resolve(input.root, input.pluginPath ?? ".")
  const state = { files: 0, bytes: 0, incomplete: false }
  const findings: SecurityFinding[] = []
  const buildCommands: string[][] = []
  walk(root, root, 0, state, findings, buildCommands, input.registryId)
  if (state.incomplete) findings.push(finding("scanner", "incomplete", "high", true, ".", "scan exceeded limits or encountered unsupported filesystem state"))
  return { files: state.files, bytes: state.bytes, findings, buildCommands }
}

function walk(base: string, dir: string, depth: number, state: { files: number; bytes: number; incomplete: boolean }, findings: SecurityFinding[], buildCommands: string[][], registryId?: string) {
  if (depth > MAX_DEPTH) { state.incomplete = true; return }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    const rel = relative(base, full) || entry.name
    if (entry.isSymbolicLink()) { state.incomplete = true; findings.push(finding("scanner", "symlink", "high", true, rel, "symlink rejected")); continue }
    if (entry.isDirectory()) { walk(base, full, depth + 1, state, findings, buildCommands, registryId); continue }
    if (!entry.isFile()) continue
    state.files += 1
    if (state.files > MAX_FILES) state.incomplete = true
    const content = readFileSync(full, "utf8")
    state.bytes += Buffer.byteLength(content)
    if (state.bytes > MAX_BYTES) state.incomplete = true
    if (/paseo-plugin\.json$/.test(entry.name)) validateManifest(content, rel, registryId, findings, buildCommands)
    if (/^(index\.(?:client|server)\.(?:ts|tsx)|index\.ts)$/.test(entry.name)) validateEntrypoint(entry.name, rel, findings)
    scanBoundaries(content, rel, findings)
  }
}

function validateManifest(raw: string, path: string, registryId: string | undefined, findings: SecurityFinding[], buildCommands: string[][]) {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.id !== "string" || (registryId && parsed.id !== registryId)) findings.push(finding("manifest", "id", "high", true, path, "manifest id must match registry id"))
    const req = parsed.requirements
    if (req !== undefined) {
      if (!req || typeof req !== "object" || Array.isArray(req)) findings.push(finding("manifest", "requirements", "high", true, path, "requirements must be an object"))
      else {
        const paseo = (req as { paseo?: unknown }).paseo
        if (paseo !== undefined && (typeof paseo !== "string" || !semver.validRange(paseo, { loose: false }))) findings.push(finding("manifest", "requirements.paseo", "high", true, path, "invalid requirements.paseo semver range"))
      }
    }
    if (parsed.build !== undefined) {
      if (!Array.isArray(parsed.build) || parsed.build.length === 0 || !parsed.build.every((cmd) => Array.isArray(cmd) && cmd.length > 0 && cmd.every((arg) => typeof arg === "string" && arg.length > 0))) findings.push(finding("manifest", "build", "high", true, path, "build must be nonempty argv arrays"))
      else for (const cmd of parsed.build as string[][]) buildCommands.push(cmd)
    }
    for (const key of Object.keys(parsed)) if (!["id", "requirements", "build"].includes(key)) findings.push(finding("manifest", `unknown:${key}`, "medium", false, path, `unknown manifest key ${key}`))
  } catch { findings.push(finding("manifest", "json", "high", true, path, "invalid JSON manifest")) }
}

function validateEntrypoint(name: string, path: string, findings: SecurityFinding[]) {
  if (name === "index.ts") findings.push(finding("entrypoint", "legacy-index", "high", true, path, "legacy-only index.ts is rejected"))
}
function scanBoundaries(content: string, path: string, findings: SecurityFinding[]) {
  if (/from\s+["']\.\.\/(client|server|shared)\//.test(content) || /from\s+["'](?:client|server|shared)\//.test(content)) findings.push(finding("boundary", "cross-runtime-import", "high", true, path, "cross-runtime import boundary violated"))
}
function finding(tool: string, ruleId: string, severity: string, blocking: boolean, path: string, message: string): SecurityFinding { return { tool, ruleId, severity, blocking, path, message } }
