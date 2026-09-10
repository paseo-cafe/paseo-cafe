import { describe, expect, it } from "vitest"
import { pluginRepositoryUrl } from "./plugin-source"

describe("pluginRepositoryUrl", () => {
  it("links root and subpath plugins to the security-scanned commit", () => {
    const commit = "d".repeat(40)
    const security = {
      status: "passed" as const,
      blockingFindings: 0,
      advisoryFindings: 0,
      commit,
    }

    expect(pluginRepositoryUrl({ repo: "owner/root", security })).toBe(
      `https://github.com/owner/root/tree/${commit}`
    )
    expect(
      pluginRepositoryUrl({
        repo: "owner/monorepo",
        path: "plugins/review",
        security,
      })
    ).toBe(`https://github.com/owner/monorepo/tree/${commit}/plugins/review`)
  })
})
