import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { boundedReport } from "./publish.ts"
import { checkoutTargetRepository, renderReport } from "./scan.ts"
import {
  REPORT_DETAILS_OPEN,
  type SecurityFinding,
  type SecurityPluginResult,
  type SecurityResults,
} from "./shared.ts"

function pluginResult(findings: SecurityFinding[]): SecurityPluginResult {
  const blockingFindings = findings.filter((finding) => finding.blocking).length
  return {
    commit: "abc123",
    scannedAt: "2026-09-09T00:00:00.000Z",
    status: blockingFindings > 0 ? "failed" : "passed",
    blockingFindings,
    advisoryFindings: findings.length - blockingFindings,
    coverage: { files: findings.length, bytes: 100 },
    buildCommands: [],
    findings,
  }
}

function securityResults(plugins: SecurityResults["plugins"]): SecurityResults {
  return {
    version: 1,
    generatedAt: "2026-09-09T00:00:00.000Z",
    plugins,
  }
}

function boundaryFinding(path: string): SecurityFinding {
  return {
    tool: "boundary",
    ruleId: "cross-runtime-import",
    severity: "high",
    blocking: true,
    path,
    message: "cross-runtime import boundary violated",
  }
}

describe("target checkout", () => {
  it("scans the immutable target commit instead of repository HEAD", () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-checkout-"))
    const source = join(root, "source")
    const destination = join(root, "checkout")
    execFileSync("git", ["init", "--quiet", source])
    writeFileSync(join(source, "value.txt"), "selected")
    execFileSync("git", ["add", "value.txt"], { cwd: source })
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Scanner Test",
        "-c",
        "user.email=scanner@example.com",
        "commit",
        "--quiet",
        "-m",
        "selected",
      ],
      { cwd: source }
    )
    const selected = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: source,
      encoding: "utf8",
    }).trim()
    writeFileSync(join(source, "value.txt"), "new head")
    execFileSync("git", ["add", "value.txt"], { cwd: source })
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Scanner Test",
        "-c",
        "user.email=scanner@example.com",
        "commit",
        "--quiet",
        "-m",
        "head",
      ],
      { cwd: source }
    )

    expect(checkoutTargetRepository(source, selected, destination)).toBe(
      selected
    )
    expect(readFileSync(join(destination, "value.txt"), "utf8")).toBe(
      "selected"
    )
  })
})

describe("security report", () => {
  it("renders each rule's guidance once across all plugins", () => {
    const report = boundedReport(
      renderReport(
        securityResults({
          first: pluginResult([boundaryFinding("client/one.ts")]),
          second: pluginResult([boundaryFinding("client/two.ts")]),
        })
      )
    )

    expect(report).toContain("<details>")
    expect(report).toContain(
      "<summary>Why these rules failed and how to fix them</summary>"
    )
    expect(report).toContain("**Issue:** The import crosses bundles")
    expect(report).toContain(
      "**Fix:** Keep UI and React Native code under `client/`"
    )
    expect(report.match(/### `boundary\/cross-runtime-import`/g)).toHaveLength(
      1
    )
  })

  it("keeps finding data from injecting report markup", () => {
    const attack = [
      "client/file.ts",
      "<details>",
      "<summary>fake result</summary>",
      "&lt;details&gt;",
      REPORT_DETAILS_OPEN,
    ].join("\n")
    const report = boundedReport(
      renderReport(
        securityResults({ example: pluginResult([boundaryFinding(attack)]) })
      )
    )

    expect(report.match(/<details>/g)).toHaveLength(1)
    expect(report.match(/<summary>/g)).toHaveLength(1)
    expect(report).not.toContain("<summary>fake result</summary>")
    expect(report).not.toContain(REPORT_DETAILS_OPEN)
    expect(report).toContain("\\n")
  })

  it("keeps guidance complete when a long findings list is truncated", () => {
    const findings = Array.from({ length: 200 }, (_, index) =>
      boundaryFinding(
        `client/${String(index).padStart(3, "0")}-${"x".repeat(400)}.ts`
      )
    )
    const report = boundedReport(
      renderReport(securityResults({ example: pluginResult(findings) }))
    )

    expect(report.length).toBeLessThanOrEqual(60_000)
    expect(report).toContain("<details>")
    expect(report).toContain("</details>")
    expect(report).toContain("### `boundary/cross-runtime-import`")
    const notice = "\n\n_Report truncated._"
    const lastPublishedLine = report.slice(0, -notice.length).split("\n").at(-1)
    expect(report.endsWith(notice)).toBe(true)
    expect(lastPublishedLine).toMatch(/^- \[boundary\].*boundary violated$/)
  })

  it("states the scanner's decimal byte limit exactly", () => {
    const finding: SecurityFinding = {
      tool: "scanner",
      ruleId: "size-limit",
      severity: "high",
      blocking: true,
      path: "large.ts",
      message: "file exceeds size budget",
    }
    const report = boundedReport(
      renderReport(securityResults({ example: pluginResult([finding]) }))
    )

    expect(report).toContain("2,000,000 bytes")
    expect(report).not.toContain("MiB")
  })

  it("provides remediation for Paseo 0.8 compatibility findings", () => {
    const findings: SecurityFinding[] = [
      ["manifest", "missing"],
      ["manifest", "requirements.unknown"],
      ["entrypoint", "missing"],
      ["boundary", "invalid-module-location"],
      ["boundary", "runtime-module-import"],
      ["boundary", "unsupported-sdk-import"],
    ].map(([tool, ruleId]) => ({
      tool,
      ruleId,
      severity: "high",
      blocking: true,
      path: ".",
      message: "incompatible with Paseo 0.8",
    }))

    const report = renderReport(
      securityResults({ example: pluginResult(findings) })
    )

    for (const finding of findings)
      expect(report).toContain(`### \`${finding.tool}/${finding.ruleId}\``)
  })

  it("fails report generation when a rule has no guidance", () => {
    const finding = { ...boundaryFinding("client/file.ts"), ruleId: "new-rule" }
    const results = securityResults({ example: pluginResult([finding]) })

    expect(() => renderReport(results)).toThrowError(
      "missing rule guidance for boundary/new-rule"
    )
  })

  it("omits rule guidance when a plugin has no findings", () => {
    const report = boundedReport(
      renderReport(securityResults({ example: pluginResult([]) }))
    )

    expect(report).not.toContain("<details>")
  })
})
