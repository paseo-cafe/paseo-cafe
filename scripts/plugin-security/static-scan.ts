#!/usr/bin/env bun
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { SecurityFinding } from "./shared.ts"

export type StaticScanInput = { root: string; pluginPath?: string }
export type StaticScanOutput = { files: number; bytes: number; findings: SecurityFinding[]; buildCommands: string[][] }

const MAX_FILES = 200
const MAX_BYTES = 2_000_000
const MAX_DEPTH = 6

export function scanStaticFiles(input: StaticScanInput): StaticScanOutput {
  const root = join(input.root, input.pluginPath ?? "")
  const files = collectFiles(root)
  const findings: SecurityFinding[] = []
  const buildCommands: string[][] = []
  let bytes = 0
  for (const file of files.slice(0, MAX_FILES)) {
    const content = readFileSync(file, "utf8")
    bytes += Buffer.byteLength(content)
    if (bytes > MAX_BYTES) {
      findings.push(finding("scanner", "size-limit", "high", true, relative(input.root, file), "plugin exceeds size budget"))
      break
    }
    if (/paseo-plugin\.json$/.test(file)) validateManifest(content, relative(input.root, file), findings)
    if (/^(?:^|.*\/)package\.json$/.test(file)) inspectPackage(content, relative(input.root, file), findings, buildCommands)
    if (/\.(?:ya?ml|json|md|txt|sh|ts|tsx)$/.test(file) && /(?:curl|wget|sudo|bash\s+-c|sh\s+-c|execSync|spawnSync|spawn\(|eval\()/i.test(content)) {
      findings.push(finding("static", "dangerous-pattern", "high", true, relative(input.root, file), "potential code execution or install action"))
    }
  }
  return { files: Math.min(files.length, MAX_FILES), bytes, findings, buildCommands }
}

function inspectPackage(content: string, path: string, findings: SecurityFinding[], buildCommands: string[][]) {
  try {
    const pkg = JSON.parse(content) as { scripts?: Record<string, string> }
    for (const [name, script] of Object.entries(pkg.scripts ?? {})) {
      if (/^(?:pre|post)?(?:install|prepare|prepack|postpack|prepublish|prepublishOnly)$/.test(name) || /(?:curl|wget|bash|sh|node|bun)\b/i.test(script)) {
        findings.push(finding("package", "script-risk", "medium", true, path, `risky package script ${name}`))
      }
      if (name === "build") buildCommands.push(["bun", "run", "build"])
    }
  } catch {
    findings.push(finding("package", "json", "high", true, path, "invalid JSON package manifest"))
  }
}

function validateManifest(raw: string, path: string, findings: SecurityFinding[]) {
  try {
    const manifest = JSON.parse(raw) as { id?: unknown; requirements?: { paseo?: unknown }; build?: unknown }
    if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) findings.push(finding("manifest", "id", "high", true, path, "invalid plugin id"))
    const paseo = manifest.requirements?.paseo
    if (paseo !== undefined && (typeof paseo !== "string" || !/^[0-9v^<>=~.*+\-\s]+$/.test(paseo))) findings.push(finding("manifest", "requirements.paseo", "high", true, path, "invalid requirements.paseo semver range"))
    if (manifest.build !== undefined && !Array.isArray(manifest.build)) findings.push(finding("manifest", "build", "high", true, path, "build must be argv arrays"))
  } catch {
    findings.push(finding("manifest", "json", "high", true, path, "invalid JSON manifest"))
  }
}

function collectFiles(dir: string, depth = 0, out: string[] = []): string[] {
  if (depth > MAX_DEPTH) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(file, depth + 1, out)
    else if (entry.isFile()) out.push(file)
  }
  return out
}

function relative(root: string, file: string) { return file.startsWith(root) ? file.slice(root.length + 1) : file }
function finding(tool: string, ruleId: string, severity: string, blocking: boolean, path: string, message: string): SecurityFinding { return { tool, ruleId, severity, blocking, path, message } }
