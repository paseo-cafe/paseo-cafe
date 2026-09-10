import { describe, expect, it, vi } from "vitest"
import {
  directoryEntrySchema,
  directoryListRpc,
  directorySettings,
  directoryUpdateStatusRpc,
  getInstallCommand,
  getSiteUrl,
  isTrustedCatalogUrl,
  isValidInstallPath,
  isValidRepo,
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
})
