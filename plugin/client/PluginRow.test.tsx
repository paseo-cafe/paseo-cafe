import type { ReactElement, ReactNode } from "react"
import * as React from "react"
import { describe, expect, it, vi } from "vitest"
import type {
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import { DEFAULT_REGISTRY_URL, directoryEntrySchema } from "../shared/directory"
import { InstallCount } from "./InstallCount"
import {
  getCategoryNames,
  getPluginRowDateBadge,
  getPluginRowInstalls,
  getPluginRowMeta,
  getPluginRowStatus,
  PluginRow,
  type PluginRowDateBadge,
} from "./PluginRow"
import { StatusPill } from "./StatusPill"

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof React>()
  return { ...actual, useMemo: (factory: () => unknown) => factory() }
})

vi.mock("@getpaseo/plugin/client/react-native", () => ({ Icon: () => null }))
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  Image: () => null,
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}))

const theme = {
  colors: new Proxy({}, { get: () => "#000000" }),
} as never

/** A schema-valid registry entry; `overrides` replaces whole top-level fields. */
function makeEntry(overrides: Record<string, unknown> = {}): DirectoryEntry {
  return directoryEntrySchema.parse({
    id: "acme/widget",
    name: "Widget",
    description: "Does widget things.",
    categories: ["tools"],
    author: { github: "acme" },
    repository: { url: "https://github.com/acme/widget" },
    artifact: {
      kind: "npm",
      package: "@acme/widget",
      version: "1.0.0",
      resolved: "https://registry.npmjs.org/@acme/widget/-/widget-1.0.0.tgz",
      integrity: `sha512-${"a".repeat(86)}`,
    },
    publishedAt: "2025-03-15T12:00:00Z",
    updatedAt: "2026-09-10T12:00:00Z",
    ...overrides,
  })
}

function installation(id: string): InstalledPlugin {
  return {
    id,
    enabled: true,
    status: "running",
    kind: "npm",
    registryId: "acme/widget",
    registryUrl: DEFAULT_REGISTRY_URL,
  }
}

function updatesFor(
  ...updates: Array<Pick<PluginUpdate, "id" | "outcome">>
): ReadonlyMap<string, PluginUpdate> {
  return new Map(updates.map((update) => [update.id, update]))
}

interface RenderOptions {
  installations?: readonly InstalledPlugin[]
  updates?: ReadonlyMap<string, PluginUpdate>
  compact?: boolean
  dateBadge?: PluginRowDateBadge
  onPress?: () => void
}

const renderRow = (entry: DirectoryEntry, options: RenderOptions = {}) =>
  PluginRow({
    entry,
    theme,
    compact: options.compact ?? false,
    installations: options.installations ?? [],
    updates: options.updates ?? new Map(),
    dateBadge: options.dateBadge,
    onPress: options.onPress ?? (() => undefined),
  })

interface ElementProps {
  children?: ReactNode
  text?: string
  installs?: { text: string }
  numberOfLines?: number
}

/** Every element in a tree, depth first. Components are not expanded. */
function collectElements(
  node: ReactNode,
  into: Array<ReactElement<ElementProps>> = []
) {
  for (const child of React.Children.toArray(node)) {
    if (React.isValidElement<ElementProps>(child)) {
      into.push(child)
      collectElements(child.props.children, into)
    }
  }
  return into
}

/** Every string rendered anywhere in an element tree, depth first; a status pill counts as its text. */
function collectText(node: ReactNode, into: string[] = []): string[] {
  for (const child of React.Children.toArray(node)) {
    if (typeof child === "string") into.push(child)
    else if (React.isValidElement<ElementProps>(child)) {
      if (child.type === StatusPill && child.props.text !== undefined) {
        into.push(child.props.text)
      }
      if (child.type === InstallCount && child.props.installs !== undefined) {
        into.push(child.props.installs.text)
      }
      collectText(child.props.children, into)
    }
  }
  return into
}

describe("plugin row status badge", () => {
  it("shows no badge for a plugin that is not installed", () => {
    expect(getPluginRowStatus([], new Map())).toBeUndefined()
    expect(collectText(renderRow(makeEntry()))).not.toContain("Installed")
  })

  it("shows an installed badge when no update is waiting", () => {
    const installed = [installation("widget")]

    expect(getPluginRowStatus(installed, new Map())).toEqual({
      text: "Installed",
      tone: "installed",
    })
    // Every non-"update" outcome reads as installed on the row.
    for (const outcome of [
      "current",
      "installed-newer",
      "local",
      "error",
    ] as const) {
      expect(
        getPluginRowStatus(installed, updatesFor({ id: "widget", outcome }))
      ).toEqual({ text: "Installed", tone: "installed" })
    }
    expect(
      collectText(renderRow(makeEntry(), { installations: installed }))
    ).toContain("Installed")
  })

  it("prefers an update badge over the installed state", () => {
    const installed = [installation("widget")]
    const updates = updatesFor({ id: "widget", outcome: "update" })

    expect(getPluginRowStatus(installed, updates)).toEqual({
      text: "Update available",
      tone: "update",
    })
    const rendered = renderRow(makeEntry(), {
      installations: installed,
      updates,
    })
    expect(collectText(rendered)).toContain("Update available")
    expect(collectText(rendered)).not.toContain("Installed")
  })

  it("renders the status as a filled pill carrying the tone", () => {
    const rendered = renderRow(makeEntry(), {
      installations: [installation("widget")],
      updates: updatesFor({ id: "widget", outcome: "update" }),
    })
    const pills = collectElements(rendered).filter(
      (element) => element.type === StatusPill
    )

    expect(pills).toHaveLength(1)
    expect(pills[0]?.props).toMatchObject({
      text: "Update available",
      tone: "update",
    })
  })

  it("counts installations and updates when a plugin is installed more than once", () => {
    const installed = [installation("widget"), installation("widget-2")]

    expect(getPluginRowStatus(installed, new Map())?.text).toBe(
      "2 installations"
    )
    expect(
      getPluginRowStatus(
        installed,
        updatesFor(
          { id: "widget", outcome: "update" },
          { id: "widget-2", outcome: "update" }
        )
      )?.text
    ).toBe("2 updates available")
  })

  it("ignores updates for installations of other plugins", () => {
    expect(
      getPluginRowStatus(
        [installation("widget")],
        updatesFor({ id: "other", outcome: "update" })
      )
    ).toEqual({ text: "Installed", tone: "installed" })
  })

  it("announces the status and install count on the pressable row", () => {
    const rendered = renderRow(makeEntry({ installs: 1_234 }), {
      installations: [installation("widget")],
      updates: updatesFor({ id: "widget", outcome: "update" }),
    }) as React.ReactElement<{ accessibilityLabel: string }>

    expect(rendered.props.accessibilityLabel).toBe(
      "View details for Widget, Update available, 1234 installs"
    )
  })
})

describe("plugin row install count", () => {
  it("compacts large counts and pluralizes", () => {
    expect(getPluginRowInstalls({ installs: 1_234 })).toEqual({
      text: "1.2k installs",
      accessibilityLabel: "1234 installs",
    })
    expect(getPluginRowInstalls({ installs: 1 })).toEqual({
      text: "1 install",
      accessibilityLabel: "1 install",
    })
    expect(getPluginRowInstalls({ installs: 0 })?.text).toBe("0 installs")
  })

  it("omits the count when the registry reports none", () => {
    expect(getPluginRowInstalls({ installs: undefined })).toBeUndefined()
    expect(
      collectText(renderRow(makeEntry())).some((text) => /install/.test(text))
    ).toBe(false)
  })

  it("renders the count on the row", () => {
    expect(
      collectText(renderRow(makeEntry({ installs: 2_500 }))).join(" ")
    ).toContain("2.5k installs")
  })
})

describe("plugin row description", () => {
  it("shows the plain-text description on a single line", () => {
    const rendered = renderRow(makeEntry())
    const description = collectElements(rendered).find(
      (element) => element.props.children === "Does widget things."
    )

    expect(description?.props.numberOfLines).toBe(1)
  })

  it("falls back to a muted placeholder when the description is empty or blank", () => {
    for (const description of ["", "   \n "]) {
      const texts = collectText(renderRow(makeEntry({ description })))
      expect(texts).toContain("No description provided.")
    }
    expect(collectText(renderRow(makeEntry()))).not.toContain(
      "No description provided."
    )
  })
})

describe("plugin row categories", () => {
  it("does not render category chips", () => {
    const texts = collectText(
      renderRow(makeEntry({ categories: ["tools", "unlabeled"] }))
    )

    expect(texts).not.toContain("tools")
    expect(texts).not.toContain("unlabeled")
  })

  it("names categories by registry label and falls back to the slug", () => {
    expect(
      getCategoryNames(
        { categories: ["tools", "unlabeled"] },
        new Map([["tools", "Developer tools"]])
      )
    ).toEqual(["Developer tools", "unlabeled"])
  })
})

describe("plugin row meta line", () => {
  it("shows the GitHub handle, or the display name when the handle is blank", () => {
    expect(getPluginRowMeta(makeEntry(), undefined)).toBe("by acme")
    expect(
      getPluginRowMeta(
        makeEntry({ author: { github: "", name: "Acme Inc" } }),
        undefined
      )
    ).toBe("by Acme Inc")
    expect(collectText(renderRow(makeEntry()))).toContain("by acme")
  })

  it("joins author and date in that order; the install count is its own element", () => {
    expect(getPluginRowMeta(makeEntry({ installs: 1_234 }), "updated")).toMatch(
      /^by acme · Updated .*2026/
    )
  })

  it("renders the install count as a separate icon element, absent when unreported", () => {
    expect(collectText(renderRow(makeEntry({ installs: 1_234 })))).toContain(
      "1.2k installs"
    )
    expect(collectText(renderRow(makeEntry()))).not.toContain("installs")
  })

  it("is absent when there is nothing to show", () => {
    const bare = makeEntry({ author: { github: " ", name: " " } })

    expect(getPluginRowMeta(bare, undefined)).toBeUndefined()
    expect(collectText(renderRow(bare))).toEqual([
      "Widget",
      "Does widget things.",
    ])
  })
})

describe("plugin row date badge", () => {
  const rowDate = (entry: DirectoryEntry, dateBadge?: PluginRowDateBadge) =>
    collectText(renderRow(entry, { dateBadge })).find((text) =>
      /(?:Added|Updated) /.test(text)
    )

  // The row must report the date the list is actually ordered by.
  it("shows the update date when ordered by recent updates", () => {
    const badge = getPluginRowDateBadge(makeEntry(), "updated")

    expect(badge).toMatch(/^Updated /)
    expect(badge).toContain("2026")
    expect(rowDate(makeEntry(), "updated")).toContain(badge)
  })

  it("shows the listing date when ordered by recently added", () => {
    const badge = getPluginRowDateBadge(makeEntry(), "added")

    expect(badge).toMatch(/^Added /)
    expect(badge).toContain("2025")
    expect(rowDate(makeEntry(), "added")).toContain(badge)
  })

  it("shows no date when the list is not ordered by one", () => {
    expect(getPluginRowDateBadge(makeEntry(), undefined)).toBeUndefined()
    expect(rowDate(makeEntry())).toBeUndefined()
  })

  it("shows no date when the registry date is unparseable", () => {
    const entry = makeEntry({ updatedAt: "not a date" })

    expect(getPluginRowDateBadge(entry, "updated")).toBeUndefined()
    expect(rowDate(entry, "updated")).toBeUndefined()
  })
})

describe("plugin row press", () => {
  it("opens the details when pressed", () => {
    const onPress = vi.fn()
    const rendered = renderRow(makeEntry(), { onPress }) as React.ReactElement<{
      onPress: () => void
    }>

    rendered.props.onPress()

    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
