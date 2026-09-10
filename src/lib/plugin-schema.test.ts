import { describe, expect, it } from "vitest"
import { pluginRecordSchema } from "./plugin-schema"

const validHealth = {
  manifestValid: true,
  hasReadme: true,
  hasLicense: true,
  hasTests: true,
  hasTypecheckScript: true,
  updatedRecently: true,
}

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
      images: [
        "https://raw.githubusercontent.com/mcowger/paseo-plugins/main/subagent-activity/images/a.png",
      ],
      scannedAt: new Date().toISOString(),
      addedAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
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
      addedAt: new Date().toISOString(),
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
      addedAt: new Date().toISOString(),
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
      addedAt: new Date().toISOString(),
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
