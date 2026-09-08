#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs"
import { z } from "zod"
import { scanStaticFiles } from "./static-scan.ts"
import type { SecurityResults } from "./shared.ts"

const args = process.argv.slice(2)
const targetsPath = valueFor(args, "--targets")
const reportPath = valueFor(args, "--report")
const jsonPath = valueFor(args, "--json")
if (!targetsPath || !reportPath) throw new Error("missing --targets or --report")

const staticOnly = args.includes("--static-only")
const targets = z.object({ version: z.literal(1), targets: z.array(z.object({ id: z.string(), repo: z.string(), ref: z.string(), commit: z.string(), path: z.string().optional() })) }).parse(JSON.parse(readFileSync(targetsPath, "utf8")))
const generatedAt = new Date().toISOString()
const results: SecurityResults = { version: 1, generatedAt, plugins: {} }
for (const target of targets.targets) {
  const staticResult = scanStaticFiles({ root: process.cwd(), pluginPath: target.path })
  const blockingFindings = staticResult.findings.filter((finding) => finding.blocking).length
  results.plugins[target.id] = { commit: target.commit, scannedAt: generatedAt, status: blockingFindings ? "failed" : "passed", blockingFindings, advisoryFindings: staticResult.findings.length - blockingFindings, coverage: { files: staticResult.files, bytes: staticResult.bytes }, buildCommands: staticResult.buildCommands, findings: staticResult.findings }
}
writeFileSync(reportPath, renderReport(results))
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(results, null, 2)}\n`)
if (!staticOnly && Object.values(results.plugins).some((plugin) => plugin.blockingFindings > 0)) process.exitCode = 1

function renderReport(results: SecurityResults) {
  const lines = ["# Security Scan", `Generated: ${results.generatedAt}`, ""]
  for (const [id, plugin] of Object.entries(results.plugins)) {
    lines.push(`## ${id}`, `Status: ${plugin.status}`, `Commit: ${plugin.commit}`, `Blocking findings: ${plugin.blockingFindings}`, `Advisory findings: ${plugin.advisoryFindings}`, "")
    for (const finding of plugin.findings) lines.push(`- [${finding.tool}] ${finding.ruleId} ${finding.path}${finding.line ? `:${finding.line}` : ""} ${finding.message}`)
    lines.push("")
  }
  return lines.join("\n")
}
function valueFor(argv: string[], flag: string) { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined }
