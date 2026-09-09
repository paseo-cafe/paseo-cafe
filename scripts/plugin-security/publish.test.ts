import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { boundedReport, publishReport, REPORT_MARKER } from "./publish.ts"

describe("publishReport", () => {
  it("creates a marker comment and writes the job summary", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return url.includes("?per_page=")
        ? Response.json([])
        : Response.json({ id: 1 })
    }) as typeof fetch
    const summaryPath = join(
      mkdtempSync(join(tmpdir(), "publish-")),
      "summary.md"
    )

    await publishReport({
      report: "# Security Scan\npassed",
      event: { pull_request: { number: 42 } },
      eventName: "pull_request_target",
      repository: "owner/repo",
      token: "token",
      summaryPath,
      fetcher,
    })

    expect(calls.at(-1)?.url).toBe(
      "https://api.github.com/repos/owner/repo/issues/42/comments"
    )
    expect(calls.at(-1)?.init?.method).toBe("POST")
    expect(readFileSync(summaryPath, "utf8")).toContain(REPORT_MARKER)
  })

  it("updates the existing marker comment", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return url.includes("?per_page=")
        ? Response.json([{ id: 7, body: `${REPORT_MARKER}\nold` }])
        : Response.json({ id: 7 })
    }) as typeof fetch

    await publishReport({
      report: "new report",
      event: { pull_request: { number: 42 } },
      eventName: "pull_request_target",
      repository: "owner/repo",
      token: "token",
      fetcher,
    })

    expect(calls.at(-1)?.url).toBe(
      "https://api.github.com/repos/owner/repo/issues/comments/7"
    )
    expect(calls.at(-1)?.init?.method).toBe("PATCH")
  })

  it("does not call GitHub outside pull_request_target", async () => {
    let called = false
    await publishReport({
      report: "report",
      event: { pull_request: { number: 42 } },
      eventName: "pull_request",
      fetcher: (async () => {
        called = true
        return Response.json({})
      }) as typeof fetch,
    })
    expect(called).toBe(false)
  })

  it("preserves collapsible report tags while neutralizing untrusted HTML", () => {
    const bounded = boundedReport(
      "<details>\n<summary>Rule guidance</summary>\n<b>@team</b>\n</details>"
    )

    expect(bounded).toContain("<details>")
    expect(bounded).toContain("<summary>Rule guidance</summary>")
    expect(bounded).toContain("</details>")
    expect(bounded).not.toContain("<b>")
    expect(bounded).not.toContain("@team")
  })

  it("bounds and neutralizes untrusted report content", () => {
    const report = `<b>@team</b>${"x".repeat(70_000)}`
    const bounded = boundedReport(report)
    expect(bounded.length).toBeLessThan(61_000)
    expect(bounded).not.toContain("<b>")
    expect(bounded).not.toContain("@team")
    expect(bounded).toContain("_Report truncated._")
  })
})
