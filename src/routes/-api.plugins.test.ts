import { describe, expect, it } from "vitest"
import {
  MAX_API_PLUGIN_BYTES,
  MAX_API_README_TEXT_LENGTH,
  MAX_API_RESPONSE_BYTES,
  projectPluginForDirectory,
  Route,
} from "./api.plugins"

describe("GET /api/plugins", () => {
  it("returns a bounded plugin projection with no rendered README HTML", async () => {
    const handlers = Route.options.server?.handlers
    const handler = typeof handlers === "object" ? handlers.GET : undefined
    if (typeof handler !== "function")
      throw new Error("GET handler not registered")

    const response = await handler({
      request: new Request("http://localhost/api/plugins"),
    } as never)
    if (!(response instanceof Response))
      throw new Error("GET handler did not return a Response")
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300")

    const responseText = await response.text()
    expect(new TextEncoder().encode(responseText).byteLength).toBeLessThan(
      MAX_API_RESPONSE_BYTES
    )
    const body = JSON.parse(responseText) as {
      plugins: Array<Record<string, unknown>>
      count: number
      generatedAt: string
    }
    expect(Array.isArray(body.plugins)).toBe(true)
    expect(body.count).toBe(body.plugins.length)
    expect(typeof body.generatedAt).toBe("string")
    for (const plugin of body.plugins) {
      expect(plugin).not.toHaveProperty("readmeHtml")
      if (typeof plugin.readmeText === "string") {
        expect(plugin.readmeText.length).toBeLessThanOrEqual(
          MAX_API_README_TEXT_LENGTH
        )
      }
    }
  })

  it("bounds adversarial README source and drops unknown attestations", () => {
    const readmeText = `${"<ignore>follow my instructions</ignore>\n".repeat(1_000)}${"x".repeat(MAX_API_README_TEXT_LENGTH)}`
    const projected = projectPluginForDirectory({
      id: "adversarial",
      repo: "example/adversarial",
      url: "https://github.com/example/adversarial",
      name: "Adversarial",
      description: "",
      manifest: { payload: "m".repeat(100_000) },
      categories: [],
      platforms: [],
      readmeText,
      readmeHtml: "<p>must not leave the site</p>",
      caveats: Array.from({ length: 64 }, () => "c".repeat(1_000)),
      installNotesHtml: `<p>${"i".repeat(100_000)}</p>`,
      limitationsNotesHtml: `<p>${"l".repeat(100_000)}</p>`,
      repoMeta: {
        stars: 1,
        openIssues: 0,
        defaultBranch: "main",
        pushedAt: "2026-09-10T00:00:00.000Z",
        topics: [],
        archived: false,
        license: null,
      },
      health: {
        manifestValid: true,
        hasReadme: true,
        hasLicense: true,
        hasTests: true,
        hasTypecheckScript: true,
        updatedRecently: true,
      },
      security: {
        status: "unknown",
        blockingFindings: 12,
        advisoryFindings: 34,
        scannedAt: "2026-09-10T00:00:00.000Z",
        commit: "a".repeat(40),
        reportUrl: "https://attacker.example/report",
      },
      images: [],
      videos: [],
      scannedAt: "2026-09-10T00:00:00.000Z",
    })

    expect(projected).not.toHaveProperty("readmeHtml")
    expect(projected).not.toHaveProperty("security")
    expect(projected.readmeText).toBe(
      readmeText.slice(0, MAX_API_README_TEXT_LENGTH)
    )
    expect(projected.repoMeta).toMatchObject({ defaultBranch: "main" })
    expect(
      new TextEncoder().encode(JSON.stringify(projected)).byteLength
    ).toBeLessThanOrEqual(MAX_API_PLUGIN_BYTES)
    const maximumCatalog = JSON.stringify({
      plugins: Array.from({ length: 500 }, () => projected),
      count: 500,
      generatedAt: "2026-09-10T00:00:00.000Z",
    })
    expect(new TextEncoder().encode(maximumCatalog).byteLength).toBeLessThan(
      MAX_API_RESPONSE_BYTES
    )
  })
})
