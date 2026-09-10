import { describe, expect, it } from "vitest"
import { getInstallCommand } from "./install-command"

describe("getInstallCommand", () => {
  it("includes --path for a subpath plugin", () => {
    expect(
      getInstallCommand({
        repo: "mcowger/paseo-plugins",
        path: "subagent-activity",
      })
    ).toBe("paseo plugin add mcowger/paseo-plugins --path subagent-activity")
  })

  it("tracks the scanned default branch", () => {
    expect(
      getInstallCommand({
        repo: "mcowger/paseo-plugins",
        path: "subagent-activity",
        repoMeta: {
          stars: 1,
          openIssues: 0,
          defaultBranch: "main",
          pushedAt: "2026-09-10T00:00:00Z",
          topics: [],
          archived: false,
          license: null,
        },
      })
    ).toBe(
      "paseo plugin add mcowger/paseo-plugins --ref main --path subagent-activity"
    )
  })

  it("omits --path for a single-plugin repo", () => {
    expect(getInstallCommand({ repo: "someone/their-plugin" })).toBe(
      "paseo plugin add someone/their-plugin"
    )
  })

  it("rejects shell metacharacters in unvalidated input", () => {
    expect(() =>
      getInstallCommand({
        repo: "someone/their-plugin",
        path: "plugin; echo 'unsafe'",
      })
    ).toThrow("Invalid plugin install target")
  })

  it("rejects an overlong path instead of emitting a different command", () => {
    expect(() =>
      getInstallCommand({
        repo: "someone/their-plugin",
        path: "x".repeat(501),
      })
    ).toThrow("exceeds registry limits")
  })
})
