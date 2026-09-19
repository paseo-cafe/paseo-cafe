import type { ReactNode } from "react"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import type { DirectoryEntry } from "../shared/directory"
import { directoryEntrySchema } from "../shared/directory"
import { InlineMarkdown } from "./InlineMarkdown"
import { getHealthBadge, getPluginRowPopularity, PluginRow } from "./PluginRow"

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return { ...actual, useMemo: (factory: () => unknown) => factory() }
})

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  Icon: () => null,
}))
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  Linking: { openURL: () => Promise.resolve() },
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

function containsElementType(node: ReactNode, type: unknown): boolean {
  return React.Children.toArray(node).some((child) => {
    if (!React.isValidElement<{ children?: ReactNode }>(child)) return false
    return (
      child.type === type || containsElementType(child.props.children, type)
    )
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

describe("plugin row description", () => {
  const theme = {
    colors: new Proxy({}, { get: () => "#000000" }),
  } as never
  const baseEntry = entryWithHealth({})
  const renderRow = (entry: DirectoryEntry) =>
    PluginRow({
      entry,
      theme,
      compact: false,
      installations: [],
      showAddedDate: false,
      onPress: () => undefined,
    })

  it("omits descriptions with no projected visible content", () => {
    const imageOnly = directoryEntrySchema.parse({
      ...baseEntry,
      description: "![](https://img.example/x.png)",
      descriptionNodes: [],
    })
    const visible = directoryEntrySchema.parse({
      ...baseEntry,
      description: "**Visible**",
      descriptionNodes: [{ type: "text", text: "Visible", strong: true }],
    })
    const legacy = directoryEntrySchema.parse({
      ...baseEntry,
      description: "Legacy raw description",
    })

    expect(containsElementType(renderRow(imageOnly), InlineMarkdown)).toBe(
      false
    )
    expect(containsElementType(renderRow(visible), InlineMarkdown)).toBe(true)
    expect(containsElementType(renderRow(legacy), InlineMarkdown)).toBe(true)
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
      accessibilityLabel: "1234 GitHub stars",
    })
    expect(getPluginRowPopularity(npmEntry)).toEqual({
      source: "npm",
      text: "1,234 downloads / 30 days",
      accessibilityLabel: "1,234 downloads / 30 days",
    })
    expect(getPluginRowPopularity(incompleteNpmEntry)).toEqual({
      source: "git",
      text: "2k",
      accessibilityLabel: "2000 GitHub stars",
    })
  })
})
