import { describe, expect, it } from "vitest"
import {
  normalizePluginVersion,
  pluginRecordSchema,
  pluginSecuritySchema,
} from "./plugin-schema"

const validHealth = {
  manifestValid: true,
  hasReadme: true,
  hasLicense: true,
  hasTests: true,
  hasTypecheckScript: true,
  updatedRecently: true,
}

function validSecurity(status: "passed" | "failed" | "unknown") {
  return {
    status,
    blockingFindings: status === "failed" ? 2 : 0,
    advisoryFindings: status === "passed" ? 0 : 1,
    scannedAt: "2026-09-09T00:00:00.000Z",
    commit: "0123456789abcdef0123456789abcdef01234567",
    reportUrl: "https://example.com/security-report",
  }
}

const validRecordBase = {
  id: "gone",
  repo: "someone/deleted-repo",
  url: "https://github.com/someone/deleted-repo",
  name: "gone",
  description: "",
  categories: [],
  health: validHealth,
  images: [],
  scannedAt: new Date().toISOString(),
}

describe("normalizePluginVersion", () => {
  it("normalizes valid semver and omits invalid versions", () => {
    expect(normalizePluginVersion("v1.2.3-beta.1+build.4")).toBe("1.2.3-beta.1")
    expect(normalizePluginVersion("1.2")).toBeUndefined()
    expect(normalizePluginVersion(undefined)).toBeUndefined()
  })
})

describe("pluginRecordSchema", () => {
  it("accepts a fully-populated scanned record", () => {
    const result = pluginRecordSchema.safeParse({
      id: "subagent-activity",
      repo: "mcowger/paseo-plugins",
      path: "subagent-activity",
      url: "https://github.com/mcowger/paseo-plugins/tree/main/subagent-activity",
      name: "subagent-activity",
      description: "Monitors managed descendants.",
      version: "0.0.0",
      license: "MIT",
      categories: ["monitoring"],
      manifest: { id: "subagent-activity", nested: { ok: true } },
      readmeText:
        "# Subagent Activity\n\nThis README is retained in bounded form.",
      readmeHtml:
        "<h1>Subagent Activity</h1>\n<p>This README is retained in bounded form.</p>",
      repoMeta: {
        stars: 3,
        openIssues: 0,
        defaultBranch: "main",
        pushedAt: new Date().toISOString(),
        topics: [],
        archived: false,
        license: "MIT",
      },
      health: validHealth,
      security: validSecurity("passed"),
      images: [
        "https://raw.githubusercontent.com/mcowger/paseo-plugins/main/subagent-activity/images/a.png",
      ],
      scannedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.readmeText).toBe(
      "# Subagent Activity\n\nThis README is retained in bounded form."
    )
    expect(result.data.readmeHtml).toBe(
      "<h1>Subagent Activity</h1>\n<p>This README is retained in bounded form.</p>"
    )
  })

  it("accepts omitted README fields for backward compatibility", () => {
    const result = pluginRecordSchema.parse({
      ...validRecordBase,
    })
    expect(result.readmeText).toBeUndefined()
    expect(result.readmeHtml).toBeUndefined()
    expect(result.security).toBeUndefined()
  })

  it("accepts http(s)-only security report URLs", () => {
    for (const reportUrl of [
      "http://example.com/security-report",
      "https://example.com/security-report",
    ]) {
      const result = pluginSecuritySchema.safeParse({
        ...validSecurity("passed"),
        reportUrl,
      })
      expect(result.success).toBe(true)
    }
  })

  it("rejects non-http security report URLs", () => {
    const result = pluginSecuritySchema.safeParse({
      ...validSecurity("passed"),
      reportUrl: "javascript:alert(1)",
    })
    expect(result.success).toBe(false)
  })

  it("rejects passed security with blocking findings", () => {
    const result = pluginSecuritySchema.safeParse({
      ...validSecurity("passed"),
      blockingFindings: 1,
    })
    expect(result.success).toBe(false)
  })

  it("requires a full commit SHA for passed and failed security results", () => {
    for (const security of [
      { ...validSecurity("passed"), commit: undefined },
      { ...validSecurity("failed"), commit: undefined },
      { ...validSecurity("passed"), commit: "abc123" },
    ]) {
      expect(pluginSecuritySchema.safeParse(security).success).toBe(false)
    }
  })

  it("allows unknown security without a commit", () => {
    const security = { ...validSecurity("unknown"), commit: undefined }
    expect(pluginSecuritySchema.parse(security).commit).toBeUndefined()
  })

  it("normalizes security commit SHAs", () => {
    const security = pluginSecuritySchema.parse({
      ...validSecurity("passed"),
      commit: "  0123456789ABCDEF0123456789ABCDEF01234567  ",
    })
    expect(security.commit).toBe("0123456789abcdef0123456789abcdef01234567")
  })

  it("accepts a record without security data", () => {
    const result = pluginRecordSchema.safeParse({
      ...validRecordBase,
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.security).toBeUndefined()
  })

  it("accepts passed, failed, and unknown security summaries", () => {
    for (const security of [
      validSecurity("passed"),
      validSecurity("failed"),
      validSecurity("unknown"),
    ]) {
      const result = pluginRecordSchema.safeParse({
        id: "gone",
        repo: "someone/deleted-repo",
        url: "https://github.com/someone/deleted-repo",
        name: "gone",
        description: "",
        categories: [],
        health: validHealth,
        security,
        images: [],
        scannedAt: new Date().toISOString(),
      })
      expect(result.success).toBe(true)
    }
  })

  it("accepts a broken-repo record with only scanError set", () => {
    const result = pluginRecordSchema.safeParse({
      id: "gone",
      repo: "someone/deleted-repo",
      url: "https://github.com/someone/deleted-repo",
      name: "gone",
      description: "",
      categories: [],
      health: {
        manifestValid: false,
        hasReadme: false,
        hasLicense: false,
        hasTests: false,
        hasTypecheckScript: false,
        updatedRecently: false,
      },
      images: [],
      scanError: "repo/path not found on GitHub: someone/deleted-repo",
      scannedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })

  it("defaults platforms and caveats to empty arrays when omitted", () => {
    const result = pluginRecordSchema.parse({
      id: "gone",
      repo: "someone/deleted-repo",
      url: "https://github.com/someone/deleted-repo",
      name: "gone",
      description: "",
      categories: [],
      health: validHealth,
      images: [],
      scannedAt: new Date().toISOString(),
    })
    expect(result.platforms).toEqual([])
    expect(result.caveats).toEqual([])
  })

  it("accepts declared platforms, caveats, and a limitations excerpt", () => {
    const result = pluginRecordSchema.safeParse({
      id: "launchd-jobs",
      repo: "gpambrozio/paseo-plugins",
      path: "launchd-jobs",
      url: "https://github.com/gpambrozio/paseo-plugins/tree/main/launchd-jobs",
      name: "launchd-jobs",
      description: "Schedule launchd jobs from Paseo.",
      categories: ["automation"],
      platforms: ["macos"],
      caveats: ["Requires a login session"],
      limitationsNotes: "- macOS only.",
      limitationsNotesHtml: "<ul>\n<li>macOS only.</li>\n</ul>",
      health: validHealth,
      images: [],
      scannedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })

  it("rejects a non-JSON-compatible manifest value", () => {
    const result = pluginRecordSchema.safeParse({
      id: "bad",
      repo: "owner/repo",
      url: "https://github.com/owner/repo",
      name: "bad",
      description: "",
      categories: [],
      manifest: { fn: () => "not serializable" },
      health: validHealth,
      images: [],
      scannedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(false)
  })
})
