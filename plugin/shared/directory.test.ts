import { describe, expect, it } from "vitest"
import {
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
    "not a URL",
  ])("rejects untrusted catalog URL %s", (url) => {
    expect(isTrustedCatalogUrl(url)).toBe(false)
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
