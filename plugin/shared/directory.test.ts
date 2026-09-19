import { describe, expect, it, vi } from "vitest"
import { getCatalogGalleryImages, isValidCatalogVersion } from "./catalog"
import {
  compareDirectoryAddedAt,
  compareDirectoryPopularity,
  compareDirectoryRecency,
  compareDirectorySource,
  DEFAULT_DIRECTORY_BROWSE_SETTINGS,
  DIRECTORY_ADDED_AT_LABEL,
  DIRECTORY_CATEGORY_LABELS,
  type DirectoryCategory,
  directoryAttachments,
  directoryBrowseSettingsEqual,
  directoryBrowseSettingsSchema,
  directoryEntrySchema,
  directoryListRpc,
  directoryManifestAttachments,
  directoryReadmeAttachments,
  directorySecurityAttachments,
  directorySettings,
  directoryUpdateStatusRpc,
  formatDirectoryCompactCount,
  getDirectoryAddedDateBadge,
  getDirectoryThemeHighlights,
  getInstallationStateLabel,
  getInstallCommand,
  getInstallRef,
  getRepositoryUrl,
  getRepositoryUrlAtRef,
  getSelfUpdateRecoveryState,
  getSiteUrl,
  getUpdateCommand,
  getUpdateReviewDetails,
  installedPluginSchema,
  isDefaultDirectoryBrowseView,
  isDirectoryAddedAtKnown,
  isOfficialPlugin,
  isPreviewUpdateAvailable,
  isTrustedCatalogUrl,
  isValidInstallPath,
  isValidRepo,
  MAX_DIRECTORY_INLINE_HREF_CHARACTERS,
  MAX_DIRECTORY_INLINE_LINK_NODES,
  MAX_DIRECTORY_INLINE_TEXT_CHARACTERS,
  MAX_DIRECTORY_INLINE_TEXT_NODES,
  migrateDirectorySettings,
  normalizeDirectoryCategories,
  normalizeDirectoryCategory,
  stripHtml,
} from "./directory"

const validEntry = {
  id: "plugin",
  repo: "owner/repo",
  url: "https://github.com/owner/repo",
  name: "Plugin",
  description: "",
  version: "1.2.3",
  categories: [],
  health: {},
  images: [],
  scannedAt: new Date().toISOString(),
}

describe("gallery images", () => {
  it("excludes owner avatar URLs while preserving plugin screenshots", () => {
    expect(
      getCatalogGalleryImages(
        [
          "https://example.com/plugin-screenshot.png",
          "https://avatars.githubusercontent.com/u/639682?size=200",
          "https://github.com/omercnet.png?size=100",
          "https://github.com/another-owner.png?size=100",
        ],
        {
          login: "OmerCNet",
          avatarUrl: "https://avatars.githubusercontent.com/u/639682?v=4",
        }
      )
    ).toEqual([
      "https://example.com/plugin-screenshot.png",
      "https://github.com/another-owner.png?size=100",
    ])
  })
})

describe("theme preview records", () => {
  const theme = {
    id: "midnight",
    name: "Midnight",
    appearance: "dark",
    colors: {
      background: "#101114",
      foreground: "#f5f7ff",
      raised: "#191b20",
      control: "#242730",
      border: "#343844",
      accent: "#8da2fb",
      mutedForeground: "#a4a8b3",
      ring: "#68729a",
    },
  }

  it("accepts complete hex palettes and defaults legacy records", () => {
    expect(
      directoryEntrySchema.parse({ ...validEntry, themes: [theme] }).themes
    ).toEqual([theme])
    expect(directoryEntrySchema.parse(validEntry).themes).toEqual([])
  })

  it("caps non-virtualized highlights in catalog popularity order", () => {
    const integrity = `sha512-${"a".repeat(86)}`
    const entry = (id: string, stars: number, downloads?: number) =>
      directoryEntrySchema.parse({
        ...validEntry,
        id,
        repo: `owner/${id}`,
        url: `https://github.com/owner/${id}`,
        repoMeta: { stars },
        ...(downloads === undefined
          ? {}
          : {
              package: id,
              npm: {
                package: id,
                version: validEntry.version,
                integrity,
                downloadsLast30Days: downloads,
                publishedAt: "2026-09-18T00:00:00.000Z",
              },
              npmSecurity: {
                status: "passed" as const,
                blockingFindings: 0,
                advisoryFindings: 0,
                version: validEntry.version,
                integrity,
              },
            }),
        themes: [{ ...theme, id: `${id}-theme` }],
      })

    expect(
      getDirectoryThemeHighlights(
        [
          entry("git-low", 10),
          entry("npm-low", 1, 10),
          entry("git-high", 200),
          entry("npm-high", 1, 20),
        ],
        3
      ).map(({ preview }) => preview.id)
    ).toEqual(["npm-high-theme", "npm-low-theme", "git-high-theme"])
    expect(getDirectoryThemeHighlights([entry("git", 1)], 0)).toEqual([])
  })

  it("rejects a palette that cannot render consistently across clients", () => {
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        themes: [
          {
            ...theme,
            colors: { ...theme.colors, background: "rebeccapurple" },
          },
        ],
      }).success
    ).toBe(false)
  })
})

describe("plugin install targets", () => {
  it("accepts GitHub repositories and safe nested plugin paths", () => {
    expect(isValidRepo("paseo-cafe/paseo-cafe")).toBe(true)
    expect(isValidInstallPath("plugins/catalog.v2")).toBe(true)
    expect(
      getInstallCommand({
        repo: "paseo-cafe/paseo-cafe",
        path: "plugin",
        security: {
          status: "passed",
          blockingFindings: 0,
          advisoryFindings: 0,
          commit: "a".repeat(40),
        },
      })
    ).toBe(
      `paseo plugin add paseo-cafe/paseo-cafe --ref ${"a".repeat(40)} --path plugin`
    )
  })
  it("uses npm only when the runtime supports it", () => {
    const entry = {
      repo: "paseo-cafe/paseo-cafe",
      path: "plugin",
      package: "@paseo-cafe/plugin",
      version: "1.2.3",
      npm: {
        package: "@paseo-cafe/plugin",
        version: "1.2.3",
        integrity: `sha512-${"a".repeat(86)}`,
      },
      npmPreview: {
        package: "@paseo-cafe/plugin",
        version: "1.3.0-next.1",
        integrity: `sha512-${"b".repeat(86)}`,
        distTag: "next" as const,
        publishedAt: "2026-09-18T00:00:00.000Z",
      },
      security: {
        status: "passed" as const,
        blockingFindings: 0,
        advisoryFindings: 0,
        commit: "a".repeat(40),
      },
    }

    expect(getInstallCommand(entry)).toBe(
      `paseo plugin add paseo-cafe/paseo-cafe --ref ${"a".repeat(40)} --path plugin`
    )
    expect(getInstallCommand(entry, true)).toBe(
      "paseo plugin add npm:@paseo-cafe/plugin@1.2.3"
    )
    expect(getInstallCommand(entry, false, "preview")).toBeUndefined()
    expect(getInstallCommand(entry, true, "preview")).toBe(
      "paseo plugin add npm:@paseo-cafe/plugin@1.3.0-next.1"
    )
    expect(
      getInstallCommand(
        {
          repo: "paseo-cafe/git-only",
          security: entry.security,
        },
        true,
        "preview"
      )
    ).toBeUndefined()
  })

  it("pins Git installs and repository links to the scanned commit", () => {
    const commit = "a".repeat(40)
    const security = {
      status: "passed" as const,
      blockingFindings: 0,
      advisoryFindings: 0,
      commit,
    }
    expect(
      getInstallCommand({
        repo: "paseo-cafe/paseo-cafe",
        path: "plugin",
        security,
      })
    ).toBe(
      `paseo plugin add paseo-cafe/paseo-cafe --ref ${commit} --path plugin`
    )
    expect(
      getRepositoryUrl({
        repo: "paseo-cafe/paseo-cafe",
        path: "plugin",
        security,
      })
    ).toBe(`https://github.com/paseo-cafe/paseo-cafe/tree/${commit}/plugin`)
    expect(
      getRepositoryUrl({
        repo: "paseo-cafe/standalone",
        security,
      })
    ).toBe(`https://github.com/paseo-cafe/standalone/tree/${commit}`)
  })
  it("links update review to the prospective commit", () => {
    expect(getRepositoryUrlAtRef({ repo: "owner/root" }, "b".repeat(40))).toBe(
      `https://github.com/owner/root/tree/${"b".repeat(40)}`
    )
  })

  it("rejects targets that could escape the repository or add CLI arguments", () => {
    expect(isValidRepo("paseo-cafe/paseo-cafe --ref attacker")).toBe(false)
    expect(isValidRepo("https://github.com/paseo-cafe/paseo-cafe")).toBe(false)
    expect(isValidInstallPath("../plugin")).toBe(false)
    expect(isValidInstallPath("plugin/../../outside")).toBe(false)
    expect(isValidInstallPath("plugin name")).toBe(false)
    expect(
      getInstallCommand({
        repo: "paseo-cafe/paseo-cafe",
        path: "bad; echo pwn",
        security: {
          status: "passed",
          blockingFindings: 0,
          advisoryFindings: 0,
          commit: "a".repeat(40),
        },
      })
    ).toBeUndefined()
  })

  it("withholds commands when no immutable revision is available", () => {
    expect(getInstallRef("release@{bad")).toBeUndefined()
    expect(
      getInstallCommand({
        repo: "paseo-cafe/paseo-cafe",
        path: "plugin",
      })
    ).toBeUndefined()
  })
  it("requires npm metadata and security to match the install target", () => {
    const integrity = `sha512-${"b".repeat(86)}`
    const npmEntry = {
      ...validEntry,
      package: "@owner/plugin",
      npm: {
        package: "@owner/plugin",
        version: "1.2.3",
        integrity,
        publishedAt: "2026-09-17T12:34:56.000Z",
        downloadsLast30Days: 1_234,
      },
      npmSecurity: {
        status: "passed" as const,
        blockingFindings: 0,
        advisoryFindings: 0,
        version: "1.2.3",
        integrity,
      },
    }

    const parsedNpmEntry = directoryEntrySchema.parse(npmEntry)
    expect(parsedNpmEntry.npm).toMatchObject({
      publishedAt: "2026-09-17T12:34:56.000Z",
      downloadsLast30Days: 1_234,
    })
    const gitEntry = directoryEntrySchema.parse(validEntry)
    expect(
      directoryEntrySchema.safeParse({ ...validEntry, npm: npmEntry.npm })
        .success
    ).toBe(false)
    expect(compareDirectorySource(parsedNpmEntry, gitEntry)).toBeLessThan(0)
    expect(formatDirectoryCompactCount(1_234)).toBe("1.2k")
    expect(
      compareDirectoryPopularity(
        parsedNpmEntry,
        directoryEntrySchema.parse({
          ...npmEntry,
          id: "less-popular",
          npm: { ...npmEntry.npm, downloadsLast30Days: 1 },
        })
      )
    ).toBeLessThan(0)
    expect(
      compareDirectoryRecency(
        parsedNpmEntry,
        directoryEntrySchema.parse({
          ...npmEntry,
          id: "older",
          npm: {
            ...npmEntry.npm,
            publishedAt: "2026-01-01T00:00:00.000Z",
          },
        })
      )
    ).toBeLessThan(0)
    expect(
      directoryEntrySchema.safeParse({
        ...npmEntry,
        npmSecurity: { ...npmEntry.npmSecurity, version: "1.2.4" },
      }).success
    ).toBe(false)
    expect(
      directoryEntrySchema.safeParse({
        ...npmEntry,
        npmSecurity: { ...npmEntry.npmSecurity, status: "failed" },
      }).success
    ).toBe(false)
    expect(
      directoryEntrySchema.safeParse({
        ...npmEntry,
        npmSecurity: { ...npmEntry.npmSecurity, blockingFindings: 1 },
      }).success
    ).toBe(false)
    const previewIntegrity = `sha512-${"c".repeat(86)}`
    expect(
      directoryEntrySchema.safeParse({
        ...npmEntry,
        npmPreview: {
          package: "@owner/plugin",
          version: "1.3.0-next.1",
          integrity: previewIntegrity,
          distTag: "next",
          publishedAt: "2026-09-18T12:34:56.000Z",
        },
        npmPreviewSecurity: {
          status: "passed",
          blockingFindings: 1,
          advisoryFindings: 0,
          version: "1.3.0-next.1",
          integrity: previewIntegrity,
        },
      }).success
    ).toBe(false)
  })
  it("shows the exact npm package and version in update review", () => {
    const installation = installedPluginSchema.parse({
      id: "plugin",
      path: "/plugins/plugin",
      enabled: true,
      status: "running",
      source: "npm",
      packageName: "@owner/plugin",
      version: "1.2.3",
      management: "reviewed",
    })

    expect(getUpdateReviewDetails(installation, { version: "1.3.0" })).toEqual({
      identity: "npm:@owner/plugin",
      revision: "1.2.3 → 1.3.0",
      review: "Review npm package @owner/plugin@1.3.0 before updating.",
    })
  })
  it("labels available npm updates explicitly", () => {
    const installation = installedPluginSchema.parse({
      id: "plugin",
      path: "/plugins/plugin",
      enabled: true,
      status: "running",
      source: "npm",
      packageName: "@owner/plugin",
      version: "1.2.3",
      management: "reviewed",
      updateState: "available",
    })

    expect(getInstallationStateLabel(installation)).toBe(
      "Update available from npm"
    )
  })

  it("offers a distinct next-tag release as Preview", () => {
    const installation = installedPluginSchema.parse({
      id: "plugin",
      path: "/plugins/plugin",
      enabled: true,
      status: "running",
      source: "npm",
      packageName: "@owner/plugin",
      version: "1.3.0-next.1",
      management: "reviewed",
    })
    const entry = {
      npmPreview: {
        package: "@owner/plugin",
        version: "1.3.0-next.2",
        integrity: `sha512-${"c".repeat(86)}`,
        publishedAt: "2026-09-18T00:00:00.000Z",
        distTag: "next" as const,
      },
    }

    expect(isPreviewUpdateAvailable(installation, entry)).toBe(true)
    expect(
      isPreviewUpdateAvailable(
        { ...installation, version: "1.3.0" },
        entry,
        false
      )
    ).toBe(true)
    expect(isPreviewUpdateAvailable(installation, entry, true)).toBe(true)
    expect(
      isPreviewUpdateAvailable(
        { ...installation, version: "1.3.0-next.3" },
        entry,
        true
      )
    ).toBe(false)
    expect(
      isPreviewUpdateAvailable(
        { ...installation, version: "1.3.0-next.2" },
        entry
      )
    ).toBe(false)
  })

  it("builds update commands for the installation source", () => {
    const commit = "a".repeat(40)
    expect(
      getUpdateCommand(
        { id: "plugin", source: "npm", management: "reviewed" },
        {
          npm: {
            package: "@owner/plugin",
            version: "1.2.3",
            integrity: `sha512-${"b".repeat(86)}`,
          },
        },
        "stable"
      )
    ).toBe("paseo plugin update plugin --version 1.2.3")
    expect(
      getUpdateCommand(
        { id: "plugin", source: "git", management: "reviewed" },
        {
          security: {
            status: "passed",
            blockingFindings: 0,
            advisoryFindings: 0,
            commit,
          },
        },
        "stable"
      )
    ).toBe(`paseo plugin update plugin --ref ${commit}`)
    expect(
      getUpdateCommand(
        { id: "plugin", source: "git", management: "legacy" },
        {},
        "stable"
      )
    ).toBe("paseo plugin update plugin")
  })

  it("rejects non-canonical npm versions", () => {
    expect(isValidCatalogVersion("1.2.3")).toBe(true)
    expect(isValidCatalogVersion("1.2.3-beta.1+build.7")).toBe(true)
    expect(isValidCatalogVersion("1.2.3-01")).toBe(false)
    expect(isValidCatalogVersion("01.2.3")).toBe(false)
  })

  it("rejects unsafe targets while parsing an untrusted catalog", () => {
    expect(
      directoryEntrySchema.safeParse({ ...validEntry, path: "bad; echo pwn" })
        .success
    ).toBe(false)
    expect(
      directoryEntrySchema.safeParse({ ...validEntry, repo: "paseo-cafe" })
        .success
    ).toBe(false)
  })
})

describe("catalog version metadata", () => {
  it("preserves versions while accepting legacy entries without one", () => {
    expect(directoryEntrySchema.parse(validEntry).version).toBe("1.2.3")
    expect(
      directoryEntrySchema.parse({ ...validEntry, version: undefined }).version
    ).toBeUndefined()
  })
})

describe("catalog URL transport policy", () => {
  it.each([
    "https://paseo.cafe/api/plugins",
    "https://catalog.internal/api/plugins",
    "http://localhost:3000/api/plugins",
    "http://LOCALHOST:3000/api/plugins",
    "http://dev.localhost:3000/api/plugins",
    "http://127.0.0.1:3000/api/plugins",
    "http://127.255.255.255/api/plugins",
    "http://[::1]:3000/api/plugins",
  ])("accepts trusted catalog URL %s", (url) => {
    expect(isTrustedCatalogUrl(url)).toBe(true)
  })

  it.each([
    "http://catalog.internal/api/plugins",
    "http://192.168.1.10/api/plugins",
    "http://127.0.0.1.evil.example/api/plugins",
    "http://[::2]/api/plugins",
    "ftp://paseo.cafe/api/plugins",
    "https://[:::]/api/plugins",
    "not a URL",
  ])("rejects untrusted catalog URL %s", (url) => {
    expect(isTrustedCatalogUrl(url)).toBe(false)
  })

  it("keeps RPC validation independent of the runtime URL parser", () => {
    class ReactNativeUrl {
      readonly href: string

      constructor(value: string) {
        this.href = value
      }

      get protocol() {
        return `${this.href.split(":", 1)[0]}:`
      }

      get hostname() {
        return this.href.includes("[") ? "[" : "LOCALHOST"
      }
    }

    vi.stubGlobal("URL", ReactNativeUrl)
    try {
      expect(
        directoryListRpc.input.safeParse({
          baseUrl: "http://[::1]:3000/api/plugins",
        }).success
      ).toBe(true)
      expect(
        directoryUpdateStatusRpc.input.safeParse({
          baseUrl: "http://LOCALHOST:3000/api/plugins",
        }).success
      ).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("rejects untrusted URLs at every caller-controlled catalog schema", () => {
    const url = "http://catalog.internal/api/plugins"

    expect(
      directorySettings.schema.safeParse({ directoryUrl: url }).success
    ).toBe(false)
    expect(directoryListRpc.input.safeParse({ baseUrl: url }).success).toBe(
      false
    )
    expect(
      directoryUpdateStatusRpc.input.safeParse({ baseUrl: url }).success
    ).toBe(false)
  })
})

describe("listing date badges", () => {
  // Mid-month and mid-day, so no time zone can shift it into another month.
  const entry = { addedAt: "2026-09-15T12:00:00Z" }
  const localDay = new Date(entry.addedAt).getDate()

  it("labels listing dates and renders them the reader's way", () => {
    expect(getDirectoryAddedDateBadge(entry, "en-US")).toBe(
      `Added Sep ${localDay}, 2026`
    )
    expect(getDirectoryAddedDateBadge(entry, "en-GB")).toBe(
      `Added ${localDay} Sept 2026`
    )
  })

  it("falls back to a fixed UTC rendering when the locale is unusable", () => {
    expect(getDirectoryAddedDateBadge(entry, "not a locale")).toBe(
      "Added 15 Sep 2026"
    )
  })

  it("shows nothing for a missing or unusable date", () => {
    expect(getDirectoryAddedDateBadge({})).toBeUndefined()
    expect(getDirectoryAddedDateBadge({ addedAt: "whenever" })).toBeUndefined()
  })
})

describe("default browse view", () => {
  it("treats the untouched surface as the default view", () => {
    expect(
      isDefaultDirectoryBrowseView(DEFAULT_DIRECTORY_BROWSE_SETTINGS)
    ).toBe(true)
  })

  it("stops being the default view once a different sort is chosen", () => {
    expect(
      isDefaultDirectoryBrowseView({
        ...DEFAULT_DIRECTORY_BROWSE_SETTINGS,
        sort: "recently-added",
      })
    ).toBe(false)
  })

  it.each([
    { query: "git" },
    { categories: ["git" as const] },
    { platforms: ["macos"] },
    { status: "installed" as const },
  ])("stops being the default view when filtered by %o", (overrides) => {
    expect(
      isDefaultDirectoryBrowseView({
        ...DEFAULT_DIRECTORY_BROWSE_SETTINGS,
        ...overrides,
      })
    ).toBe(false)
  })
})

describe("directory listing dates", () => {
  it("keeps the catalog's listing date on parsed entries", () => {
    expect(
      directoryEntrySchema.parse({
        ...validEntry,
        addedAt: "2026-03-04T05:06:07Z",
      }).addedAt
    ).toBe("2026-03-04T05:06:07Z")
  })

  it("keeps an entry whose listing date is unusable instead of dropping it", () => {
    const entry = directoryEntrySchema.parse({
      ...validEntry,
      addedAt: "whenever",
    })

    expect(entry.id).toBe("plugin")
    expect(
      compareDirectoryAddedAt(entry, { addedAt: "2026-01-01T00:00:00Z" })
    ).toBeGreaterThan(0)
  })

  it("does not treat a truthy invalid date as a known listing date", () => {
    expect(isDirectoryAddedAtKnown({ addedAt: "whenever" })).toBe(false)
    expect(isDirectoryAddedAtKnown({ addedAt: "1969-12-31T23:59:59Z" })).toBe(
      false
    )
    expect(
      compareDirectoryAddedAt({ addedAt: "1969-12-31T23:59:59Z" }, {})
    ).toBe(0)
    expect(isDirectoryAddedAtKnown({ addedAt: "2026-01-01T00:00:00Z" })).toBe(
      true
    )
  })

  it("orders newest listings first and unknown dates last", () => {
    const entries = [
      { id: "unknown" },
      { id: "older", addedAt: "2026-01-01T00:00:00Z" },
      { id: "newer", addedAt: "2026-07-01T00:00:00Z" },
    ]

    expect(
      [...entries].sort(compareDirectoryAddedAt).map((entry) => entry.id)
    ).toEqual(["newer", "older", "unknown"])
  })

  it("persists the shared sort mode under the same label as the website", () => {
    expect(
      directoryBrowseSettingsSchema.parse({ sort: "recently-added" }).sort
    ).toBe("recently-added")
    expect(DIRECTORY_ADDED_AT_LABEL).toBe("Recent")
    expect(
      directoryBrowseSettingsSchema.safeParse({ sort: "recent" }).success
    ).toBe(false)
  })
})

describe("directory taxonomy and browse settings", () => {
  it("normalizes catalog categories without replacing stable slugs with labels", () => {
    const labelsWithPunctuation: Record<DirectoryCategory, string> = {
      ...DIRECTORY_CATEGORY_LABELS,
      "code-review": "Code Review & QA / Security",
    }
    const categories = normalizeDirectoryCategories([
      " Code Review ",
      "code-review",
    ])

    expect(categories).toEqual(["code-review"])
    expect(
      categories.map((category) => ({
        slug: category,
        label: labelsWithPunctuation[category],
      }))
    ).toEqual([{ slug: "code-review", label: "Code Review & QA / Security" }])
    expect(normalizeDirectoryCategory("unrecognized-category")).toBe("other")
  })

  it("fills missing browse fields with durable defaults", () => {
    expect(directoryBrowseSettingsSchema.parse({ query: "git" })).toEqual({
      ...DEFAULT_DIRECTORY_BROWSE_SETTINGS,
      query: "git",
    })
  })

  it("parses current settings with a complete browse state", () => {
    expect(
      directorySettings.schema.parse({
        directoryUrl: "https://catalog.internal/api/plugins",
      }).browse
    ).toEqual(DEFAULT_DIRECTORY_BROWSE_SETTINGS)
  })

  it("treats reordered category selections as the same persisted state", () => {
    const left = {
      ...DEFAULT_DIRECTORY_BROWSE_SETTINGS,
      categories: ["automation", "code-review"] as DirectoryCategory[],
    }
    const right = {
      ...DEFAULT_DIRECTORY_BROWSE_SETTINGS,
      categories: ["code-review", "automation"] as DirectoryCategory[],
    }

    expect(directoryBrowseSettingsEqual(left, right)).toBe(true)
    expect(
      directoryBrowseSettingsEqual(left, {
        ...right,
        categories: ["automation"],
      })
    ).toBe(false)
    expect(
      directoryBrowseSettingsEqual(left, { ...right, query: "changed" })
    ).toBe(false)
  })

  it("migrates version 1 settings without losing the directory URL", () => {
    const directoryUrl = "https://catalog.internal/api/plugins"
    const migrated = migrateDirectorySettings({ directoryUrl }, 1)

    expect(migrated).toEqual({
      directoryUrl,
      browse: DEFAULT_DIRECTORY_BROWSE_SETTINGS,
    })
    expect(directorySettings.schema.parse(migrated)).toEqual({
      directoryUrl,
      browse: DEFAULT_DIRECTORY_BROWSE_SETTINGS,
      previewOptIns: [],
      pendingSelfUpdate: null,
    })
  })

  it("migrates the removed repository-activity sort to version updates", () => {
    const migrated = migrateDirectorySettings(
      {
        directoryUrl: "https://catalog.internal/api/plugins",
        browse: {
          ...DEFAULT_DIRECTORY_BROWSE_SETTINGS,
          sort: "recent",
        },
      },
      2
    )

    expect(directorySettings.schema.parse(migrated).browse.sort).toBe(
      "updates-first"
    )
  })
})

it("reconciles pending self-updates from installed runtime state", () => {
  const pending = {
    installationId: "paseo-cafe",
    source: "npm" as const,
    targetRevision: "0.6.0",
    requestedAt: "2026-09-19T12:00:00.000Z",
  }
  const installation = installedPluginSchema.parse({
    id: "paseo-cafe",
    path: "/tmp/paseo-cafe",
    enabled: true,
    status: "running",
    source: "npm",
    version: "0.6.0",
  })

  expect(
    getSelfUpdateRecoveryState(
      pending,
      [installation],
      Date.parse("2026-09-19T12:00:30.000Z")
    )
  ).toBe("succeeded")
  expect(
    getSelfUpdateRecoveryState(
      pending,
      [{ ...installation, version: "0.5.0" }],
      Date.parse("2026-09-19T12:01:00.000Z")
    )
  ).toBe("pending")
  expect(
    getSelfUpdateRecoveryState(
      pending,
      [{ ...installation, version: "0.5.0" }],
      Date.parse("2026-09-19T12:02:00.000Z")
    )
  ).toBe("failed")
  expect(
    getSelfUpdateRecoveryState(
      pending,
      [{ ...installation, status: "failed" }],
      Date.parse("2026-09-19T12:00:01.000Z")
    )
  ).toBe("failed")
})

describe("directory attachment sources", () => {
  it("offers distinct listing, manifest, README, and security choices", () => {
    const sources = [
      directoryAttachments,
      directoryManifestAttachments,
      directoryReadmeAttachments,
      directorySecurityAttachments,
    ]

    expect(sources.map((source) => source.id)).toEqual([
      "paseo-plugins",
      "paseo-plugin-manifests",
      "paseo-plugin-readmes",
      "paseo-plugin-security",
    ])
    expect(sources.map((source) => source.title)).toEqual([
      "Paseo plugin",
      "Paseo plugin manifest",
      "Paseo plugin README",
      "Paseo plugin security",
    ])
    expect(sources.map((source) => source.search.name)).toEqual([
      "directory.search",
      "directory.search-manifests",
      "directory.search-readmes",
      "directory.search-security",
    ])
  })
})

describe("directory presentation", () => {
  it("builds an encoded canonical directory URL", () => {
    expect(getSiteUrl({ id: "plugin/name" })).toBe(
      "https://paseo.cafe/plugins/plugin%2Fname"
    )
  })

  it("derives official status from a complete install repository path", () => {
    expect(isOfficialPlugin({ repo: "paseo-cafe/paseo-cafe" })).toBe(true)
    expect(isOfficialPlugin({ repo: "PASEO-CAFE/another-plugin" })).toBe(true)
    expect(isOfficialPlugin({ repo: "paseo-cafe" })).toBe(false)
    expect(isOfficialPlugin({ repo: "paseo-cafe/" })).toBe(false)
    expect(isOfficialPlugin({ repo: "paseo-cafe/plugin/extra" })).toBe(false)
    expect(isOfficialPlugin({ repo: "attacker/evil" })).toBe(false)
  })

  it("converts sanitized README fragments to readable plain text", () => {
    expect(
      stripHtml(
        '<p>Review &amp; install <strong>carefully</strong>.</p><script>alert("x")</script>'
      )
    ).toBe("Review & install carefully.")
    expect(stripHtml("<span>separate</span><span>segments</span>")).toBe(
      "separate segments"
    )
  })
})

describe("directory README content", () => {
  it("retains bounded readmeText markdown", () => {
    const readmeText = [
      "# Plugin",
      "<script>alert('x')</script>",
      "- selectable plain text",
    ].join("\n")

    const result = directoryEntrySchema.parse({
      ...validEntry,
      readmeText,
    })

    expect(result.readmeText).toBe(readmeText)
  })

  it("allows entries without readmeText", () => {
    const result = directoryEntrySchema.safeParse(validEntry)

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("expected readme-less entry to parse")
    }

    expect(result.data.readmeText).toBeUndefined()
  })

  it("rejects readmeText beyond the catalog bound", () => {
    const result = directoryEntrySchema.safeParse({
      ...validEntry,
      readmeText: "a".repeat(200_001),
    })

    expect(result.success).toBe(false)
  })
})

describe("directory inline markdown", () => {
  const textNode = { type: "text" as const, text: "x" }

  it("accepts only safe links with visible labels", () => {
    for (const href of [
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "intent://scan",
      "mailto:%20",
    ]) {
      expect(
        directoryEntrySchema.safeParse({
          ...validEntry,
          descriptionNodes: [
            { type: "link", href, children: [{ ...textNode, text: "open" }] },
          ],
        }).success,
        href
      ).toBe(false)
    }

    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        descriptionNodes: [
          {
            type: "link",
            href: "https://example.com",
            children: [{ ...textNode, text: "\u200B" }],
          },
        ],
      }).success
    ).toBe(false)
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        descriptionNodes: [
          {
            type: "link",
            href: "mailto:author@example.com",
            children: [{ ...textNode, text: "Email author" }],
          },
        ],
      }).success
    ).toBe(true)
  })

  it("rejects aggregate inline node limits", () => {
    const linkNodes = Array.from(
      { length: MAX_DIRECTORY_INLINE_LINK_NODES + 1 },
      () => ({
        type: "link" as const,
        href: "https://example.com",
        children: [textNode],
      })
    )
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        caveats: ["links"],
        caveatNodes: [linkNodes],
      }).success
    ).toBe(false)

    const textGroups = Array.from(
      { length: Math.ceil((MAX_DIRECTORY_INLINE_TEXT_NODES + 1) / 1_000) },
      (_, group) =>
        Array.from(
          {
            length: Math.min(
              1_000,
              MAX_DIRECTORY_INLINE_TEXT_NODES + 1 - group * 1_000
            ),
          },
          () => textNode
        )
    )
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        caveats: textGroups.map(() => "text"),
        caveatNodes: textGroups,
      }).success
    ).toBe(false)
  })

  it("rejects aggregate inline character limits", () => {
    const text = "x".repeat(4_000)
    const textNodes = Array.from(
      {
        length:
          Math.floor(MAX_DIRECTORY_INLINE_TEXT_CHARACTERS / text.length) + 1,
      },
      () => ({ ...textNode, text })
    )
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        caveats: ["text"],
        caveatNodes: [textNodes],
      }).success
    ).toBe(false)

    const href = `https://example.com/${"a".repeat(1_980)}`
    const hrefNodes = Array.from(
      {
        length:
          Math.floor(MAX_DIRECTORY_INLINE_HREF_CHARACTERS / href.length) + 1,
      },
      () => ({ type: "link" as const, href, children: [textNode] })
    )
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        caveats: ["links"],
        caveatNodes: [hrefNodes],
      }).success
    ).toBe(false)
  })

  it("requires parsed caveats to align with raw caveats", () => {
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        caveats: [],
        caveatNodes: [[textNode]],
      }).success
    ).toBe(false)
  })
})

describe("directory security summaries", () => {
  it.each(["passed", "failed", "unknown"] as const)(
    "retains a populated %s security summary",
    (status) => {
      const security = {
        status,
        blockingFindings: status === "failed" ? 2 : 0,
        advisoryFindings: 1,
        scannedAt: "2026-09-09T00:00:00.000Z",
        commit: status === "unknown" ? undefined : "a".repeat(40),
        reportUrl: "https://example.com/security-report",
      }

      const result = directoryEntrySchema.parse({ ...validEntry, security })

      expect(result.security).toEqual(security)
    }
  )

  it("rejects non-HTTP security report URLs", () => {
    const result = directoryEntrySchema.safeParse({
      ...validEntry,
      security: {
        status: "unknown",
        blockingFindings: 0,
        advisoryFindings: 0,
        reportUrl: "javascript:alert(1)",
      },
    })

    expect(result.success).toBe(false)
  })

  it("rejects a non-unknown status with no commit", () => {
    const result = directoryEntrySchema.safeParse({
      ...validEntry,
      security: {
        status: "passed",
        blockingFindings: 0,
        advisoryFindings: 0,
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects "passed" status with blocking findings', () => {
    const result = directoryEntrySchema.safeParse({
      ...validEntry,
      security: {
        status: "passed",
        blockingFindings: 1,
        advisoryFindings: 0,
        commit: "a".repeat(40),
      },
    })

    expect(result.success).toBe(false)
  })

  it("rejects a malformed commit", () => {
    const result = directoryEntrySchema.safeParse({
      ...validEntry,
      security: {
        status: "failed",
        blockingFindings: 1,
        advisoryFindings: 0,
        commit: "abc123",
      },
    })

    expect(result.success).toBe(false)
  })

  it("allows entries without a security summary", () => {
    const result = directoryEntrySchema.parse(validEntry)

    expect(result.security).toBeUndefined()
  })
})

describe("directory catalog manifests", () => {
  it("retains nested JSON-compatible manifest data", () => {
    const manifest = {
      id: "plugin",
      nested: {
        ok: true,
        list: [1, { two: 2 }],
      },
    }

    const result = directoryEntrySchema.parse({
      ...validEntry,
      manifest,
    })

    expect(result.manifest).toEqual(manifest)
  })

  it("allows entries without a manifest", () => {
    const result = directoryEntrySchema.safeParse(validEntry)

    expect(result.success).toBe(true)
    if (!result.success) {
      throw new Error("expected manifest-less entry to parse")
    }

    expect(result.data.manifest).toBeUndefined()
  })

  it("rejects manifests beyond the depth limit", () => {
    let manifest: Record<string, unknown> = { leaf: true }
    for (let depth = 0; depth < 16; depth += 1) {
      manifest = { nested: manifest }
    }

    expect(
      directoryEntrySchema.safeParse({ ...validEntry, manifest }).success
    ).toBe(false)
  })

  it("rejects manifests beyond the serialized byte limit", () => {
    const manifest = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [
        `field-${index}`,
        "x".repeat(10_000),
      ])
    )

    expect(
      directoryEntrySchema.safeParse({ ...validEntry, manifest }).success
    ).toBe(false)
  })

  it("rejects oversized catalog fields and arrays", () => {
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        description: "x".repeat(4_001),
      }).success
    ).toBe(false)
    expect(
      directoryEntrySchema.safeParse({
        ...validEntry,
        categories: Array.from({ length: 33 }, () => "productivity"),
      }).success
    ).toBe(false)
  })
})
