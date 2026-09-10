import { describe, expect, it } from "vitest"
import {
  normalizeCategory,
  registryEntrySchema,
  registryIdSchema,
} from "./registry-schema"

describe("registryEntrySchema", () => {
  it("accepts a minimal valid entry", () => {
    const result = registryEntrySchema.safeParse({
      repo: "mcowger/paseo-plugins",
      path: "subagent-activity",
    })
    expect(result.success).toBe(true)
  })

  it("defaults categories, platforms, and caveats to empty arrays", () => {
    const result = registryEntrySchema.parse({
      repo: "gpambrozio/paseo-plugins",
    })
    expect(result.categories).toEqual([])
    expect(result.platforms).toEqual([])
    expect(result.caveats).toEqual([])
  })

  it("accepts a declared platform restriction and caveats", () => {
    const result = registryEntrySchema.safeParse({
      repo: "gpambrozio/paseo-plugins",
      path: "launchd-jobs",
      platforms: ["macos"],
      caveats: [
        "Requires a login session; won't run from a headless SSH-only daemon",
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown platform", () => {
    const result = registryEntrySchema.safeParse({
      repo: "owner/repo",
      platforms: ["freebsd"],
    })
    expect(result.success).toBe(false)
  })

  it("rejects more than 6 caveats", () => {
    const result = registryEntrySchema.safeParse({
      repo: "owner/repo",
      caveats: Array.from({ length: 7 }, (_, i) => `caveat ${i}`),
    })
    expect(result.success).toBe(false)
  })

  it("rejects a caveat over 140 characters", () => {
    const result = registryEntrySchema.safeParse({
      repo: "owner/repo",
      caveats: ["x".repeat(141)],
    })
    expect(result.success).toBe(false)
  })

  it.each(["Subagent-Activity", "sub_agent", "-subagent"])(
    "rejects malformed registry filename ID %s",
    (id) => {
      expect(registryIdSchema.safeParse(id).success).toBe(false)
    }
  )

  it("rejects a repo that isn't 'owner/repo'", () => {
    const result = registryEntrySchema.safeParse({
      repo: "https://github.com/owner/repo",
    })
    expect(result.success).toBe(false)
  })

  it.each(["../plugin", "plugin/../../outside", "plugin; echo pwn"])(
    "rejects unsafe plugin path %s",
    (path) => {
      expect(
        registryEntrySchema.safeParse({ repo: "owner/repo", path }).success
      ).toBe(false)
    }
  )

  it("rejects a redundant registry id field", () => {
    const result = registryEntrySchema.safeParse({
      id: "plugin",
      repo: "owner/repo",
    })
    expect(result.success).toBe(false)
  })
})

describe("category taxonomy", () => {
  it.each([
    [" GitHub ", "github"],
    ["CODE REVIEW", "code-review"],
    ["  code   review  ", "code-review"],
    ["unrecognized", "other"],
    ["", "other"],
  ])("normalizes %j to %s", (source, expected) => {
    expect(normalizeCategory(source)).toBe(expected)
  })

  it("does not mutate a registry record's source categories", () => {
    const categories = [" GitHub ", "custom-category"]
    const result = registryEntrySchema.parse({ repo: "owner/repo", categories })

    expect(result.categories).toEqual(categories)
  })
})
