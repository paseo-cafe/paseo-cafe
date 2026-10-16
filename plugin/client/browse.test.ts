import { describe, expect, it } from "vitest"
import type {
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import { DEFAULT_REGISTRY_URL, directoryEntrySchema } from "../shared/directory"
import {
  categoryOptions,
  countByStatus,
  filterBySearchAndCategories,
  filterByStatus,
  indexInstallations,
  invalidListingsNotice,
  recountCategories,
  selectFeatured,
  splitThemes,
} from "./browse"

interface EntryOptions {
  name?: string
  description?: string
  categories?: string[]
  author?: { github: string; name?: string }
  updatedAt?: string
}

function entry(
  slug: string,
  {
    name = slug,
    description = "",
    categories = [],
    author = { github: "acme" },
    updatedAt = "2026-01-01T00:00:00Z",
  }: EntryOptions = {}
): DirectoryEntry {
  return directoryEntrySchema.parse({
    id: `acme/${slug}`,
    name,
    description,
    categories,
    author,
    repository: { url: `https://github.com/acme/${slug}` },
    artifact: {
      kind: "git",
      remote: `https://github.com/acme/${slug}`,
      commit: "b".repeat(40),
    },
    publishedAt: "2026-01-01T00:00:00Z",
    updatedAt,
  })
}

function installation(
  id: string,
  extra: Partial<InstalledPlugin> = {}
): InstalledPlugin {
  return { id, enabled: true, status: "running", kind: "git", ...extra }
}

function slugs(entries: readonly DirectoryEntry[]): string[] {
  return entries.map((item) => item.id.replace("acme/", ""))
}

describe("filterBySearchAndCategories", () => {
  const labels = new Map([
    ["themes", "Themes & appearance"],
    ["tools", "Developer tools"],
  ])
  const entries = [
    entry("ember", {
      name: "Ember Theme",
      description: "A warm palette",
      categories: ["themes"],
      author: { github: "ada", name: "Ada Lovelace" },
    }),
    entry("lint", {
      name: "Linter",
      description: "Runs checks",
      categories: ["tools"],
    }),
    entry("both", { name: "Both", categories: ["themes", "tools"] }),
    entry("plain", { name: "Plain" }),
  ]

  it("returns everything without a query or categories", () => {
    expect(
      filterBySearchAndCategories(entries, "  ", new Set(), labels)
    ).toHaveLength(4)
  })

  it("matches name, description, author, id and category slug or label, ignoring case", () => {
    const search = (query: string) =>
      slugs(filterBySearchAndCategories(entries, query, new Set(), labels))
    expect(search("EMBER")).toEqual(["ember"])
    expect(search("palette")).toEqual(["ember"])
    expect(search("lovelace")).toEqual(["ember"])
    expect(search("ada")).toEqual(["ember"])
    expect(search("acme/lint")).toEqual(["lint"])
    expect(search("developer tools")).toEqual(["lint", "both"])
    expect(search("themes")).toEqual(["ember", "both"])
    expect(search("nothing like this")).toEqual([])
  })

  it("keeps entries in any selected category", () => {
    expect(
      slugs(
        filterBySearchAndCategories(entries, "", new Set(["tools"]), labels)
      )
    ).toEqual(["lint", "both"])
    expect(
      slugs(
        filterBySearchAndCategories(
          entries,
          "",
          new Set(["themes", "tools"]),
          labels
        )
      )
    ).toEqual(["ember", "lint", "both"])
  })

  it("applies the query and the categories together", () => {
    expect(
      slugs(
        filterBySearchAndCategories(entries, "both", new Set(["tools"]), labels)
      )
    ).toEqual(["both"])
    expect(
      slugs(
        filterBySearchAndCategories(
          entries,
          "ember",
          new Set(["tools"]),
          labels
        )
      )
    ).toEqual([])
  })
})

describe("installation status", () => {
  const entries = [entry("fresh"), entry("stale"), entry("current")]
  const installations = new Map<string, readonly InstalledPlugin[]>([
    ["acme/stale", [installation("stale")]],
    ["acme/current", [installation("current")]],
  ])
  const updates = new Map<string, PluginUpdate>([
    ["stale", { id: "stale", outcome: "update", target: "2.0.0" }],
    ["current", { id: "current", outcome: "current" }],
  ])

  it("filters to installed, updatable, and not installed listings", () => {
    expect(
      slugs(filterByStatus(entries, "installed", installations, updates))
    ).toEqual(["stale", "current"])
    expect(
      slugs(filterByStatus(entries, "updates", installations, updates))
    ).toEqual(["stale"])
    expect(
      slugs(filterByStatus(entries, "not-installed", installations, updates))
    ).toEqual(["fresh"])
    expect(
      slugs(filterByStatus(entries, "all", installations, updates))
    ).toEqual(["fresh", "stale", "current"])
  })

  it("counts what each filter shows", () => {
    expect(countByStatus(entries, installations, updates)).toEqual({
      all: 3,
      installed: 2,
      updates: 1,
      "not-installed": 1,
    })
  })

  it("matches installations to listings of this registry only", () => {
    const official = entry("official")
    const other = entry("other")
    const index = indexInstallations(
      [official, other],
      [
        installation("official", {
          registryId: "acme/official",
          registryUrl: `${DEFAULT_REGISTRY_URL}/`,
        }),
        installation("other", {
          registryId: "acme/other",
          registryUrl: "https://mirror.example",
        }),
      ],
      DEFAULT_REGISTRY_URL
    )

    expect([...index.keys()]).toEqual(["acme/official"])
  })
})

describe("categoryOptions", () => {
  it("lists the registry's categories in its order, only those in use, with counts", () => {
    const entries = [
      entry("a", { categories: ["tools", "themes"] }),
      entry("b", { categories: ["tools", "tools"] }),
      entry("c", { categories: ["unlisted"] }),
    ]
    expect(
      categoryOptions(entries, [
        { slug: "themes", label: "Themes" },
        { slug: "empty", label: "Empty" },
        { slug: "tools", label: "Tools" },
      ])
    ).toEqual([
      { slug: "themes", label: "Themes", count: 1 },
      { slug: "tools", label: "Tools", count: 2 },
    ])
  })
})

describe("recountCategories", () => {
  const options = [
    { slug: "themes", label: "Themes", count: 100 },
    { slug: "tools", label: "Tools", count: 100 },
    { slug: "git", label: "Git", count: 100 },
  ]

  it("counts only the entries the chips would be applied to, keeping empty chips listed", () => {
    const matching = [
      entry("a", { categories: ["tools", "themes"] }),
      entry("b", { categories: ["tools", "tools"] }),
    ]

    expect(recountCategories(options, matching)).toEqual([
      { slug: "themes", label: "Themes", count: 1 },
      { slug: "tools", label: "Tools", count: 2 },
      { slug: "git", label: "Git", count: 0 },
    ])
  })

  it("reports zero everywhere when nothing matches", () => {
    expect(
      recountCategories(options, []).map((option) => option.count)
    ).toEqual([0, 0, 0])
  })
})

describe("featured selection", () => {
  const entries = [entry("one"), entry("two"), entry("three"), entry("four")]

  it("features listings in the registry's order, skipping unknown and repeated ids", () => {
    expect(
      slugs(
        selectFeatured(entries, [
          "acme/three",
          "acme/missing",
          "acme/one",
          "acme/three",
        ])
      )
    ).toEqual(["three", "one"])
  })

  it("features nothing when the registry names nothing", () => {
    expect(selectFeatured(entries, [])).toEqual([])
  })
})

describe("splitThemes", () => {
  const entries = [
    entry("git-tool", { categories: ["git"] }),
    entry("dracula", { categories: ["themes"] }),
    entry("themed-sidebar", { categories: ["sidebar", "themes"] }),
    entry("uncategorised"),
  ]

  it("separates themes from plugins, keeping the input order", () => {
    const { themes, plugins } = splitThemes(entries)
    expect(slugs(themes)).toEqual(["dracula", "themed-sidebar"])
    expect(slugs(plugins)).toEqual(["git-tool", "uncategorised"])
  })

  it("treats a listing as a theme whenever it carries the themes category", () => {
    const { themes } = splitThemes([
      entry("both", { categories: ["utils", "themes"] }),
    ])
    expect(slugs(themes)).toEqual(["both"])
  })

  it("returns two empty lists for no entries", () => {
    expect(splitThemes([])).toEqual({ themes: [], plugins: [] })
  })
})

describe("invalidListingsNotice", () => {
  it("is absent when every listing validated", () => {
    expect(invalidListingsNotice(0)).toBeNull()
  })

  it("states how many listings are hidden", () => {
    expect(invalidListingsNotice(1)).toBe(
      "1 listing failed validation and is hidden."
    )
    expect(invalidListingsNotice(3)).toBe(
      "3 listings failed validation and are hidden."
    )
  })
})
