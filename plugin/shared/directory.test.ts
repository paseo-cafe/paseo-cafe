import { describe, expect, it, vi } from "vitest"
import {
  DEFAULT_DIRECTORY_BROWSE_SETTINGS,
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
  getInstallCommand,
  getSiteUrl,
  isTrustedCatalogUrl,
  isValidInstallPath,
  isValidRepo,
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
  categories: [],
  health: {},
  images: [],
  scannedAt: new Date().toISOString(),
}

describe("plugin install targets", () => {
  it("accepts GitHub repositories and safe nested plugin paths", () => {
    expect(isValidRepo("paseo-cafe/paseo-cafe")).toBe(true)
    expect(isValidInstallPath("plugins/catalog.v2")).toBe(true)
    expect(
      getInstallCommand({
        repo: "paseo-cafe/paseo-cafe",
        path: "plugin",
      })
    ).toBe("paseo plugin add paseo-cafe/paseo-cafe --path plugin")
  })

  it("rejects targets that could escape the repository or add CLI arguments", () => {
    expect(isValidRepo("paseo-cafe/paseo-cafe --ref attacker")).toBe(false)
    expect(isValidRepo("https://github.com/paseo-cafe/paseo-cafe")).toBe(false)
    expect(isValidInstallPath("../plugin")).toBe(false)
    expect(isValidInstallPath("plugin/../../outside")).toBe(false)
    expect(isValidInstallPath("plugin name")).toBe(false)
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
    })
  })
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
