import { describe, expect, it } from "vitest"
import { pluginJsonLd, serializePluginJsonLd } from "./json-ld"
import type { PluginRecord } from "./plugin-schema"

const basePlugin: PluginRecord = {
  id: "subagent-activity",
  repo: "mcowger/paseo-plugins",
  path: "subagent-activity",
  url: "https://github.com/mcowger/paseo-plugins/tree/main/subagent-activity",
  name: "subagent-activity",
  description: "Monitors managed descendants.",
  version: "0.0.0",
  license: "MIT",
  categories: ["monitoring"],
  platforms: [],
  caveats: [],
  owner: {
    login: "mcowger",
    avatarUrl: "https://avatars.githubusercontent.com/u/1929548?v=4",
    url: "https://github.com/mcowger",
  },
  health: {
    manifestValid: true,
    hasReadme: true,
    hasLicense: true,
    hasTests: true,
    hasTypecheckScript: true,
    updatedRecently: true,
  },
  images: [],
  videos: [],
  scannedAt: "2026-09-01T00:00:00.000Z",
}

describe("pluginJsonLd", () => {
  it("builds a SoftwareApplication schema with the plugin's own data", () => {
    const ld = pluginJsonLd(basePlugin)
    expect(ld["@type"]).toBe("SoftwareApplication")
    expect(ld.name).toBe("subagent-activity")
    expect(ld.url).toContain("/plugins/subagent-activity")
    expect(ld.license).toBe("https://spdx.org/licenses/MIT.html")
    expect(ld.author).toEqual({
      "@type": "Person",
      name: "mcowger",
      url: "https://github.com/mcowger",
    })
  })

  it("publishes the semantic version and catalog date, not repository activity", () => {
    const ld = pluginJsonLd({
      ...basePlugin,
      version: "1.2.3",
      addedAt: "2026-09-11T12:00:00Z",
      repoMeta: {
        stars: 1,
        openIssues: 0,
        defaultBranch: "main",
        pushedAt: "2026-09-12T12:00:00Z",
        topics: [],
        archived: false,
        license: "MIT",
      },
    })

    expect(ld.softwareVersion).toBe("1.2.3")
    expect(ld.datePublished).toBe("2026-09-11T12:00:00Z")
    expect(ld).not.toHaveProperty("dateModified")
  })

  it("falls back to the generated OG image when there are no screenshots", () => {
    const ld = pluginJsonLd(basePlugin)
    expect(ld.image).toContain("/og/subagent-activity.png")
  })

  it("uses the first screenshot when available", () => {
    const ld = pluginJsonLd({
      ...basePlugin,
      images: ["https://example.com/shot.png"],
    })
    expect(ld.image).toBe("https://example.com/shot.png")
  })

  it("defaults operatingSystem to Any when no platforms are declared", () => {
    const ld = pluginJsonLd(basePlugin)
    expect(ld.operatingSystem).toBe("Any")
  })

  it("reflects declared platforms in operatingSystem instead of Any", () => {
    const ld = pluginJsonLd({ ...basePlugin, platforms: ["macos"] })
    expect(ld.operatingSystem).toBe("macOS")
  })

  it("joins multiple declared platforms", () => {
    const ld = pluginJsonLd({ ...basePlugin, platforms: ["macos", "linux"] })
    expect(ld.operatingSystem).toBe("macOS, Linux")
  })

  it("omits undefined optional fields entirely when serialized", () => {
    const { owner: _owner, ...withoutOwner } = basePlugin
    const ld = pluginJsonLd({ ...withoutOwner, license: undefined })
    const json = JSON.parse(JSON.stringify(ld))
    expect(json).not.toHaveProperty("license")
    expect(json).not.toHaveProperty("author")
  })
})

describe("serializePluginJsonLd", () => {
  it("escapes script-closing markup without changing the JSON value", () => {
    const description = "</script><script>alert('xss')</script>"
    const serialized = serializePluginJsonLd({ ...basePlugin, description })

    expect(serialized).not.toContain("<")
    expect(JSON.parse(serialized).description).toBe(description)
  })
})
