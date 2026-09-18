import { describe, expect, it } from "vitest"
import { getGitInstallCommand, getInstallCommand } from "./install-command"

const COMMIT = "a".repeat(40)
const security = {
  status: "passed" as const,
  blockingFindings: 0,
  advisoryFindings: 0,
  commit: COMMIT,
}

describe("getInstallCommand", () => {
  it("pins a subpath Git plugin to the scanned commit", () => {
    expect(
      getInstallCommand({
        repo: "mcowger/paseo-plugins",
        path: "subagent-activity",
        security,
      })
    ).toBe(
      `paseo plugin add mcowger/paseo-plugins --ref ${COMMIT} --path subagent-activity`
    )
  })

  it("omits --path for a single-plugin repo", () => {
    expect(getInstallCommand({ repo: "someone/their-plugin", security })).toBe(
      `paseo plugin add someone/their-plugin --ref ${COMMIT}`
    )
  })

  it("pins npm while retaining the exact Git command", () => {
    const plugin = {
      repo: "someone/their-plugin",
      package: "@someone/paseo-plugin",
      version: "1.2.3",
      security,
    }

    expect(getInstallCommand(plugin)).toBe(
      "paseo plugin add npm:@someone/paseo-plugin@1.2.3"
    )
    expect(getGitInstallCommand(plugin)).toBe(
      `paseo plugin add someone/their-plugin --ref ${COMMIT}`
    )
  })

  it("withholds mutable or invalid targets", () => {
    expect(getInstallCommand({ repo: "someone/their-plugin" })).toBeUndefined()
    expect(
      getInstallCommand({
        repo: "someone/their-plugin",
        path: "plugin; echo 'unsafe'",
        security,
      })
    ).toBeUndefined()
    expect(
      getInstallCommand({
        repo: "someone/their-plugin",
        path: "x".repeat(501),
        security,
      })
    ).toBeUndefined()
    expect(
      getInstallCommand({
        repo: "someone/their-plugin",
        package: "@someone/paseo-plugin",
        security,
      })
    ).toBeUndefined()
  })
})
