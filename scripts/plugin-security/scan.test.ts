import { describe, expect, it } from "vitest"
import { renderReport } from "./scan.ts"
import type { SecurityResults } from "./shared.ts"

describe("security report", () => {
  it("renders deduplicated rule guidance for findings", () => {
    const results: SecurityResults = {
      version: 1,
      generatedAt: "2026-09-09T00:00:00.000Z",
      plugins: {
        example: {
          commit: "abc123",
          scannedAt: "2026-09-09T00:00:00.000Z",
          status: "failed",
          blockingFindings: 2,
          advisoryFindings: 0,
          coverage: { files: 2, bytes: 100 },
          buildCommands: [],
          findings: [
            {
              tool: "boundary",
              ruleId: "cross-runtime-import",
              severity: "high",
              blocking: true,
              path: "client/one.ts",
              message: "cross-runtime import boundary violated",
            },
            {
              tool: "boundary",
              ruleId: "cross-runtime-import",
              severity: "high",
              blocking: true,
              path: "client/two.ts",
              message: "cross-runtime import boundary violated",
            },
          ],
        },
      },
    }

    const report = renderReport(results)

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

  it("omits rule guidance when a plugin has no findings", () => {
    const results: SecurityResults = {
      version: 1,
      generatedAt: "2026-09-09T00:00:00.000Z",
      plugins: {
        example: {
          commit: "abc123",
          scannedAt: "2026-09-09T00:00:00.000Z",
          status: "passed",
          blockingFindings: 0,
          advisoryFindings: 0,
          coverage: { files: 2, bytes: 100 },
          buildCommands: [],
          findings: [],
        },
      },
    }

    expect(renderReport(results)).not.toContain("<details>")
  })
})
