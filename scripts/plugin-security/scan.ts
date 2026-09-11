#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import {
  REPORT_DETAILS_CLOSE,
  REPORT_DETAILS_OPEN,
  REPORT_SUMMARY_CLOSE,
  REPORT_SUMMARY_OPEN,
  type SecurityFinding,
  type SecurityPluginResult,
  type SecurityResults,
  type SecurityTarget,
} from "./shared.ts"
import { scanStaticFiles } from "./static-scan.ts"

const CLONE_TIMEOUT_MS = 60_000

function main() {
  const args = process.argv.slice(2)
  const targetsPath = valueFor(args, "--targets")
  const reportPath = valueFor(args, "--report")
  const jsonPath = valueFor(args, "--json")

  if (!targetsPath || !reportPath) {
    throw new Error("missing --targets or --report")
  }

  const targets = z
    .object({
      version: z.literal(1),
      targets: z.array(
        z.object({
          id: z.string(),
          repo: z.string(),
          path: z.string().optional(),
          ref: z.string(),
          commit: z.string(),
        })
      ),
    })
    .parse(JSON.parse(readFileSync(targetsPath, "utf8")))

  const generatedAt = new Date().toISOString()
  const results: SecurityResults = { version: 1, generatedAt, plugins: {} }
  for (const target of targets.targets) {
    results.plugins[target.id] = scanTarget(target, generatedAt)
  }

  writeFileSync(reportPath, renderReport(results))
  if (jsonPath) {
    writeFileSync(jsonPath, `${JSON.stringify(results, null, 2)}\n`)
  }
  if (
    Object.values(results.plugins).some((plugin) => plugin.blockingFindings > 0)
  ) {
    process.exitCode = 1
  }
}
function runGit(
  args: string[],
  cwd: string | undefined,
  env: NodeJS.ProcessEnv
): string {
  const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: CLONE_TIMEOUT_MS,
  })
  if (result.status !== 0)
    throw new Error(
      result.error?.message ||
        result.stderr ||
        result.stdout ||
        "git command failed"
    )
  return result.stdout.trim()
}

export function checkoutTargetRepository(
  source: string,
  commit: string,
  destination: string,
  env: NodeJS.ProcessEnv = scrubEnv()
): string {
  runGit(["init", "--quiet", destination], undefined, env)
  runGit(
    ["fetch", "--depth=1", "--filter=blob:none", "--no-tags", source, commit],
    destination,
    env
  )
  runGit(
    ["checkout", "--quiet", "--detach", "--force", "FETCH_HEAD"],
    destination,
    env
  )
  const actualCommit = runGit(["rev-parse", "HEAD"], destination, env)
  if (actualCommit !== commit)
    throw new Error(`checked out ${actualCommit}, expected ${commit}`)
  return actualCommit
}

function scanTarget(
  target: SecurityTarget,
  generatedAt: string
): SecurityPluginResult {
  const temp = mkdtempSync(join(tmpdir(), "paseo-plugin-security-"))
  try {
    const repoDir = join(temp, "repo")
    const commit = checkoutTargetRepository(
      `https://github.com/${target.repo}.git`,
      target.commit,
      repoDir,
      scrubEnv()
    )
    const staticResult = scanStaticFiles({
      root: repoDir,
      pluginPath: target.path ?? ".",
      registryId: target.id,
    })
    const findings = staticResult.findings
    const blockingFindings = findings.filter(
      (finding) => finding.blocking
    ).length
    return {
      commit,
      scannedAt: generatedAt,
      status: blockingFindings ? "failed" : "passed",
      blockingFindings,
      advisoryFindings: findings.length - blockingFindings,
      coverage: { files: staticResult.files, bytes: staticResult.bytes },
      buildCommands: staticResult.buildCommands,
      findings,
    }
  } catch (error) {
    return {
      commit: target.commit,
      scannedAt: generatedAt,
      status: "unavailable",
      blockingFindings: 1,
      advisoryFindings: 0,
      coverage: { files: 0, bytes: 0 },
      buildCommands: [],
      findings: [
        {
          tool: "scanner",
          ruleId: "scan-error",
          severity: "high",
          blocking: true,
          path: target.path ?? ".",
          message: (error as Error).message,
        },
      ],
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function scrubEnv() {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ["PATH", "HOME", "TMPDIR"]) {
    if (process.env[key]) env[key] = process.env[key]
  }
  env.GIT_LFS_SKIP_SMUDGE = "1"
  env.GIT_TERMINAL_PROMPT = "0"
  env.GIT_CONFIG_GLOBAL = "/dev/null"
  env.GIT_CONFIG_NOSYSTEM = "1"
  return env
}

type RuleGuidance = {
  issue: string
  fix: string
}

const RULE_GUIDANCE: Record<string, RuleGuidance> = {
  "scanner/incomplete": {
    issue:
      "The scanner could not inspect the complete executable plugin graph, so a clean result cannot be trusted.",
    fix: "Keep the reachable runtime graph within 200 files, 2 MB (2,000,000 bytes) total, 2 MB per file, and six directory levels. Resolve any accompanying scanner finding first.",
  },
  "scanner/symlink": {
    issue:
      "Symlinks can escape the reviewed plugin tree or change what code is loaded after review.",
    fix: "Replace the symlink with a regular file or directory inside the plugin.",
  },
  "scanner/size-limit": {
    issue:
      "The scanner skipped a reachable runtime file larger than its 2 MB inspection limit.",
    fix: "Reduce the reachable runtime file below 2,000,000 bytes.",
  },
  "scanner/scan-error": {
    issue:
      "The scanner could not clone, resolve, or inspect the submitted plugin revision.",
    fix: "Verify the repository, ref, and plugin path are accessible and correct, then rerun the check.",
  },
  "manifest/missing": {
    issue: "The plugin root does not contain `paseo-plugin.json`.",
    fix: "Add a manifest with a valid lowercase kebab-case `id` and `requirements.paseo` range.",
  },
  "manifest/id": {
    issue:
      "The plugin manifest is missing an id, uses an invalid id, or differs from the registry entry.",
    fix: "Set `paseo-plugin.json` → `id` to the exact lowercase kebab-case registry id.",
  },
  "manifest/requirements": {
    issue: "The manifest's `requirements` value is not an object.",
    fix: 'Use an object such as `{ "paseo": ">=0.8.0" }`.',
  },
  "manifest/requirements.paseo": {
    issue:
      "The manifest is missing `requirements.paseo` or its value is not a valid npm semver range. Paseo 0.8 treats a missing range as a pre-0.8 plugin.",
    fix: "Declare a valid range such as `>=0.8.0` or `>=0.8.3 <0.9.0`.",
  },
  "manifest/requirements.unknown": {
    issue: "The manifest contains an unsupported requirement key.",
    fix: "Remove the key. `paseo` is the only supported requirement.",
  },
  "manifest/build": {
    issue:
      "Build commands must be explicit argument arrays so they run without a shell.",
    fix: 'Use a non-empty array of non-empty argv arrays, for example `[["bun", "install", "--frozen-lockfile"]]`.',
  },
  "manifest/unknown": {
    issue:
      "The manifest contains a key the current plugin format does not recognize. Paseo rejects unknown top-level keys.",
    fix: "Remove the key. Supported top-level keys are `id`, `requirements`, and `build`.",
  },
  "manifest/json": {
    issue: "The scanner could not parse `paseo-plugin.json`.",
    fix: "Make the manifest valid JSON without comments or trailing commas.",
  },
  "entrypoint/legacy-index": {
    issue:
      "Paseo 0.8 no longer loads the legacy `index.ts` or `index.tsx` plugin entrypoint.",
    fix: "Move app contributions to `index.client.ts` or `.tsx`, daemon contributions to `index.server.ts` or `.tsx`, or provide both.",
  },
  "entrypoint/missing": {
    issue:
      "The plugin does not provide a Paseo 0.8 client or server entrypoint.",
    fix: "Add `index.client.ts` or `.tsx`, `index.server.ts` or `.tsx`, or both at the plugin root.",
  },
  "boundary/cross-runtime-import": {
    issue:
      "The import crosses bundles that run in different environments. Client code cannot load server code, server code cannot load client code, and shared code cannot depend on either runtime.",
    fix: "Keep UI and React Native code under `client/`, Node code under `server/`, and runtime-neutral contracts and values under `shared/`. Client and server modules may both import shared modules.",
  },
  "boundary/invalid-module-location": {
    issue:
      "A runtime module imports plugin code from the root or outside `client/`, `server/`, and `shared/`.",
    fix: "Move the imported module under the directory for its runtime and update the import path.",
  },
  "boundary/runtime-module-import": {
    issue:
      "The import uses a module owned by another runtime. Client and shared code cannot use Node or server SDK modules; server and shared code cannot use React or client SDK modules.",
    fix: "Move runtime-specific work under `client/` or `server/` and keep `shared/` limited to runtime-neutral contracts and values.",
  },
  "boundary/unsupported-sdk-import": {
    issue:
      "The import uses a private, retired, or unknown Paseo plugin SDK entry.",
    fix: "Use only the 0.8 SDK root, `/client`, `/client/ui`, `/client/react-native`, `/server`, `/server/provider`, or `/server/acp` entry appropriate to the module runtime.",
  },
}

function guidanceKey(finding: SecurityFinding): string {
  if (finding.tool === "manifest" && finding.ruleId.startsWith("unknown:"))
    return "manifest/unknown"
  return `${finding.tool}/${finding.ruleId}`
}

function escapeReportText(value: string): string {
  return value
    .replace(/[\uE000\uE001]/g, "�")
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replace(/([`*_[\]{}()#+\-.!|~])/g, "\\$1")
}

function renderRuleGuidance(findings: SecurityFinding[]): string[] {
  const rules = new Map<string, RuleGuidance>()
  for (const finding of findings) {
    const key = guidanceKey(finding)
    const guidance = RULE_GUIDANCE[key]
    if (!guidance) throw new Error(`missing rule guidance for ${key}`)
    rules.set(key, guidance)
  }
  if (rules.size === 0) return []

  const lines = [
    REPORT_DETAILS_OPEN,
    `${REPORT_SUMMARY_OPEN}Why these rules failed and how to fix them${REPORT_SUMMARY_CLOSE}`,
    "",
  ]
  for (const [rule, guidance] of rules) {
    lines.push(
      `### \`${rule}\``,
      "",
      `**Issue:** ${guidance.issue}`,
      "",
      `**Fix:** ${guidance.fix}`,
      ""
    )
  }
  lines.push(REPORT_DETAILS_CLOSE)
  return lines
}

export function renderReport(results: SecurityResults) {
  const lines = [
    "# Security Scan",
    `Generated: ${escapeReportText(results.generatedAt)}`,
    "",
  ]
  const findings = Object.values(results.plugins).flatMap(
    (plugin) => plugin.findings
  )
  const guidance = renderRuleGuidance(findings)
  if (guidance.length > 0) lines.push(...guidance, "")

  for (const [id, plugin] of Object.entries(results.plugins)) {
    lines.push(
      `## ${escapeReportText(id)}`,
      `Status: ${plugin.status}`,
      `Commit: ${escapeReportText(plugin.commit)}`,
      `Blocking findings: ${plugin.blockingFindings}`,
      `Advisory findings: ${plugin.advisoryFindings}`,
      ""
    )
    for (const finding of plugin.findings) {
      const location = `${finding.path}${finding.line ? `:${finding.line}` : ""}`
      lines.push(
        `- [${escapeReportText(finding.tool)}] ${escapeReportText(finding.ruleId)} ${escapeReportText(location)} ${escapeReportText(finding.message)}`
      )
    }
    lines.push("")
  }
  return lines.join("\n")
}

function valueFor(argv: string[], flag: string) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

if (import.meta.main) main()
