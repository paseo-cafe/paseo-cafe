#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import type {
  SecurityFinding,
  SecurityPluginResult,
  SecurityResults,
  SecurityTarget,
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

function scanTarget(
  target: SecurityTarget,
  generatedAt: string
): SecurityPluginResult {
  const temp = mkdtempSync(join(tmpdir(), "paseo-plugin-security-"))
  try {
    const repoDir = join(temp, "repo")
    const env = scrubEnv()
    const clone = spawnSync(
      "git",
      [
        "-c",
        "core.hooksPath=/dev/null",
        "clone",
        "--depth=1",
        "--filter=blob:none",
        "--no-tags",
        "--single-branch",
        `https://github.com/${target.repo}.git`,
        repoDir,
      ],
      { env, encoding: "utf8", timeout: CLONE_TIMEOUT_MS }
    )
    if (clone.status !== 0) {
      throw new Error(
        clone.error?.message ||
          clone.stderr ||
          clone.stdout ||
          "git clone failed"
      )
    }
    const rev = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repoDir,
      env,
      encoding: "utf8",
    })
    if (rev.status !== 0) {
      throw new Error(rev.stderr || rev.stdout || "git rev-parse failed")
    }
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
      commit: rev.stdout.trim(),
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
      "The scanner could not inspect the complete plugin, so a clean result cannot be trusted.",
    fix: "Keep the plugin within 200 files, 2 MiB total, 2 MiB per file, and six directory levels. Resolve any accompanying scanner finding first.",
  },
  "scanner/symlink": {
    issue:
      "Symlinks can escape the reviewed plugin tree or change what code is loaded after review.",
    fix: "Replace the symlink with a regular file or directory inside the plugin.",
  },
  "scanner/size-limit": {
    issue: "The scanner skipped a file larger than its 2 MiB inspection limit.",
    fix: "Remove generated artifacts from the plugin or reduce the file below 2 MiB.",
  },
  "scanner/scan-error": {
    issue:
      "The scanner could not clone, resolve, or inspect the submitted plugin revision.",
    fix: "Verify the repository, ref, and plugin path are accessible and correct, then rerun the check.",
  },
  "manifest/id": {
    issue:
      "The plugin manifest is missing an id or its id differs from the registry entry.",
    fix: "Set `paseo-plugin.json` → `id` to the exact registry id.",
  },
  "manifest/requirements": {
    issue: "The manifest's `requirements` value is not an object.",
    fix: 'Use an object such as `{ "paseo": ">=0.8.0" }`.',
  },
  "manifest/requirements.paseo": {
    issue: "The declared Paseo requirement is not a valid npm semver range.",
    fix: "Use a valid range such as `>=0.8.0` or `>=0.8.3 <0.9.0`.",
  },
  "manifest/build": {
    issue:
      "Build commands must be explicit argument arrays so they run without a shell.",
    fix: 'Use a non-empty array of non-empty argv arrays, for example `[["bun", "install", "--frozen-lockfile"]]`.',
  },
  "manifest/unknown": {
    issue:
      "The manifest contains a key the current plugin format does not recognize.",
    fix: "Remove the key. Supported top-level keys are `id`, `requirements`, and `build`.",
  },
  "manifest/json": {
    issue: "The scanner could not parse `paseo-plugin.json`.",
    fix: "Make the manifest valid JSON without comments or trailing commas.",
  },
  "entrypoint/legacy-index": {
    issue: "Paseo 0.8 no longer loads the legacy `index.ts` plugin entrypoint.",
    fix: "Move app contributions to `index.client.ts` or `.tsx`, daemon contributions to `index.server.ts`, or provide both.",
  },
  "boundary/cross-runtime-import": {
    issue:
      "The import crosses bundles that run in different environments. Client code cannot load server code, server code cannot load client code, and shared code cannot depend on either runtime.",
    fix: "Keep UI and React Native code under `client/`, Node code under `server/`, and runtime-neutral contracts and values under `shared/`. Client and server modules may both import shared modules.",
  },
}

function guidanceKey(finding: SecurityFinding): string {
  if (finding.tool === "manifest" && finding.ruleId.startsWith("unknown:"))
    return "manifest/unknown"
  return `${finding.tool}/${finding.ruleId}`
}

function renderRuleGuidance(findings: SecurityFinding[]): string[] {
  const rules = new Map<string, RuleGuidance>()
  for (const finding of findings) {
    const key = guidanceKey(finding)
    const guidance = RULE_GUIDANCE[key]
    if (guidance) rules.set(key, guidance)
  }
  if (rules.size === 0) return []

  const lines = [
    "<details>",
    "<summary>Why these rules failed and how to fix them</summary>",
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
  lines.push("</details>")
  return lines
}

export function renderReport(results: SecurityResults) {
  const lines = ["# Security Scan", `Generated: ${results.generatedAt}`, ""]
  for (const [id, plugin] of Object.entries(results.plugins)) {
    lines.push(
      `## ${id}`,
      `Status: ${plugin.status}`,
      `Commit: ${plugin.commit}`,
      `Blocking findings: ${plugin.blockingFindings}`,
      `Advisory findings: ${plugin.advisoryFindings}`,
      ""
    )
    for (const finding of plugin.findings) {
      lines.push(
        `- [${finding.tool}] ${finding.ruleId} ${finding.path}${finding.line ? `:${finding.line}` : ""} ${finding.message}`
      )
    }
    const guidance = renderRuleGuidance(plugin.findings)
    if (guidance.length > 0) lines.push("", ...guidance)
    lines.push("")
  }
  return lines.join("\n")
}

function valueFor(argv: string[], flag: string) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

if (import.meta.main) main()
