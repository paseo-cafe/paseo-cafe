import { describe, expect, it } from "vitest"
import { boundedReport } from "./publish.ts"
import { renderReport } from "./scan.ts"
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
