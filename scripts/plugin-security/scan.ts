#!/usr/bin/env bun
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { z } from "zod"
import type {
  SecurityPluginResult,
  SecurityResults,
  SecurityTarget,
} from "./shared.ts"
import { scanStaticFiles } from "./static-scan.ts"

const CLONE_TIMEOUT_MS = 60_000

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
  results.plugins[target.id] = scanTarget(target)
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

function scanTarget(target: SecurityTarget): SecurityPluginResult {
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

function renderReport(results: SecurityResults) {
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
    lines.push("")
  }
  return lines.join("\n")
}

function valueFor(argv: string[], flag: string) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}
