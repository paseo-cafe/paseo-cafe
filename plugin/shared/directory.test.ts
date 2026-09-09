import { describe, expect, it } from "vitest"
import {
  getInstallCommand,
  getSiteUrl,
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
