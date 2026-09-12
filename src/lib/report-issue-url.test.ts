import { afterEach, describe, expect, it, vi } from "vitest"

const plugin = {
  id: "example-plugin",
  name: "Example Plugin",
  repo: "owner/repository",
  path: undefined,
  security: undefined,
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("buildReportIssueUrl", () => {
  it("keeps the listing URL inside a fork's project base path", async () => {
    vi.stubEnv("VITE_SITE_URL", "https://someone.github.io/paseo-cafe")
    // The site identity is read at module load, so this test intentionally
    // reloads the known module after changing its build-time environment.
    vi.resetModules()
    const { buildReportIssueUrl } = await import("./report-issue-url")

    const issue = new URL(buildReportIssueUrl(plugin))

    expect(issue.searchParams.get("body")).toContain(
      "Listing URL: https://someone.github.io/paseo-cafe/plugins/example-plugin"
    )
  })
})
