import { describe, expect, it, vi } from "vitest"
import type { DirectoryEntry } from "../shared/directory"
import { directoryEntrySchema } from "../shared/directory"
import { getHealthBadge, getPluginRowPopularity } from "./PluginRow"

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  Icon: () => null,
}))
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  Image: () => null,
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}))

function entryWithHealth(health: DirectoryEntry["health"]): DirectoryEntry {
  return directoryEntrySchema.parse({
    id: "health-test",
    repo: "owner/repo",
    url: "https://github.com/owner/repo",
    name: "Health Test",
    health,
  })
}

describe("plugin row health badge", () => {
  it("counts only explicit failures and renders unknown checks as incomplete", () => {
    expect(getHealthBadge(entryWithHealth({ manifestValid: false }))).toEqual({
      text: "Health 1 warning",
      color: "warning",
    })
    expect(getHealthBadge(entryWithHealth({ manifestValid: true }))).toEqual({
      text: "Health incomplete",
      color: "muted",
    })
    expect(getHealthBadge(entryWithHealth({}))).toEqual({
      text: "Health incomplete",
      color: "muted",
    })
  })
})

describe("plugin row popularity", () => {
  it("preserves compact Git stars and labels npm downloads separately", () => {
    const gitEntry = directoryEntrySchema.parse({
      id: "git-plugin",
      repo: "owner/git-plugin",
      url: "https://github.com/owner/git-plugin",
      name: "Git plugin",
      repoMeta: { stars: 1_234 },
    })
    const integrity = `sha512-${"a".repeat(86)}`
    const npmEntry = directoryEntrySchema.parse({
      id: "npm-plugin",
      repo: "owner/npm-plugin",
      url: "https://github.com/owner/npm-plugin",
      name: "npm plugin",
      package: "npm-plugin",
      version: "1.0.0",
      npm: {
        package: "npm-plugin",
        version: "1.0.0",
        integrity,
        downloadsLast30Days: 1_234,
        publishedAt: "2026-09-18T00:00:00.000Z",
      },
      npmSecurity: {
        status: "passed",
        blockingFindings: 0,
        advisoryFindings: 0,
        version: "1.0.0",
        integrity,
      },
    })
    const incompleteNpmEntry = directoryEntrySchema.parse({
      ...npmEntry,
      npm: { ...npmEntry.npm, publishedAt: undefined },
      repoMeta: { stars: 2_000 },
    })

    expect(getPluginRowPopularity(gitEntry)).toEqual({
      source: "git",
      text: "1.2k",
    })
    expect(getPluginRowPopularity(npmEntry)).toEqual({
      source: "npm",
      text: "1,234 downloads / 30 days",
    })
    expect(getPluginRowPopularity(incompleteNpmEntry)).toEqual({
      source: "git",
      text: "2k",
    })
  })
})
