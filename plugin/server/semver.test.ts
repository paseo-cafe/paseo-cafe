import { describe, expect, it } from "vitest"
import { isVersionAtLeast, parseVersion } from "./semver"

describe("isVersionAtLeast", () => {
  it("orders prereleases by semver.org precedence", () => {
    const floor = "0.11.0-beta.4"
    expect(isVersionAtLeast("0.11.0-beta.3", floor)).toBe(false)
    expect(isVersionAtLeast("0.11.0-beta.4", floor)).toBe(true)
    expect(isVersionAtLeast("0.11.0-beta.10", floor)).toBe(true)
    expect(isVersionAtLeast("0.11.0-rc.1", floor)).toBe(true)
    expect(isVersionAtLeast("0.11.0-alpha.9", floor)).toBe(false)
    expect(isVersionAtLeast("0.11.0", floor)).toBe(true)
    expect(isVersionAtLeast("0.10.99", floor)).toBe(false)
    expect(isVersionAtLeast("1.0.0", floor)).toBe(true)
  })

  it("ranks a shorter prerelease below a longer one and ignores build metadata", () => {
    expect(isVersionAtLeast("0.11.0-beta", "0.11.0-beta.1")).toBe(false)
    expect(isVersionAtLeast("0.11.0-beta.4+abc", "0.11.0-beta.4")).toBe(true)
  })

  it("rejects text that is not exactly one version", () => {
    expect(isVersionAtLeast("paseo 0.12.0", "0.11.0")).toBe(false)
    expect(isVersionAtLeast("0.12", "0.11.0")).toBe(false)
    expect(isVersionAtLeast("01.2.3", "0.11.0")).toBe(false)
    expect(isVersionAtLeast("", "0.11.0")).toBe(false)
  })
})

describe("parseVersion", () => {
  it("accepts a leading v and surrounding whitespace", () => {
    expect(parseVersion(" v1.2.3\n")).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: [],
    })
  })
})
