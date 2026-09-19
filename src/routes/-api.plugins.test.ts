import { describe, expect, it } from "vitest"
import {
  directoryPluginSchema,
  MAX_API_PLUGIN_BYTES,
  MAX_API_README_TEXT_LENGTH,
  MAX_API_RESPONSE_BYTES,
  projectPluginForDirectory,
} from "@/lib/directory-api"
import { Route } from "./api.plugins"

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
      descriptionNodes: [],
      version: "1.2.3",
      package: "@example/adversarial",
      npm: {
        package: "@example/adversarial",
        version: "1.2.3",
        integrity: `sha512-${"b".repeat(86)}`,
        publishedAt: "2026-09-09T12:00:00.000Z",
        downloadsLast30Days: 1_234,
      },
      npmSecurity: {
        status: "passed",
        blockingFindings: 0,
        advisoryFindings: 1,
        version: "1.2.3",
        integrity: `sha512-${"b".repeat(86)}`,
      },
      npmPreview: {
        package: "@example/adversarial",
        version: "1.2.3-next.1",
        integrity: `sha512-${"p".repeat(40_000)}`,
        publishedAt: "2026-09-10T12:00:00.000Z",
        distTag: "next",
      },
      npmPreviewSecurity: {
        status: "passed",
        blockingFindings: 0,
        advisoryFindings: 1,
        version: "1.2.3-next.1",
        integrity: `sha512-${"p".repeat(40_000)}`,
      },
      manifest: { payload: "m".repeat(100_000) },
      categories: [],
      platforms: [],
      readmeText,
      readmeHtml: "<p>must not leave the site</p>",
      caveats: Array.from({ length: 64 }, () => "c".repeat(1_000)),
      caveatNodes: Array.from({ length: 64 }, () => [
        { type: "text" as const, text: "c".repeat(1_000) },
      ]),
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
    expect(directoryPluginSchema.safeParse(projected).success).toBe(true)
    expect(projected.version).toBe("1.2.3")
    expect(projected.package).toBe("@example/adversarial")
    expect(projected.npm).toMatchObject({
      version: "1.2.3",
      publishedAt: "2026-09-09T12:00:00.000Z",
      downloadsLast30Days: 1_234,
    })
    expect(projected.npmSecurity).toMatchObject({ status: "passed" })
    expect(projected).not.toHaveProperty("npmPreview")
    expect(projected).not.toHaveProperty("npmPreviewSecurity")
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

  it("preserves Git popularity metadata for plugins without npm", () => {
    const projected = projectPluginForDirectory({
      id: "git-only",
      repo: "example/git-only",
      url: "https://github.com/example/git-only",
      name: "Git only",
      description: "",
      descriptionNodes: [],
      categories: [],
      platforms: [],
      caveats: [],
      caveatNodes: [],
      repoMeta: {
        stars: 42,
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
      images: [],
      videos: [],
      scannedAt: "2026-09-10T00:00:00.000Z",
    })

    expect(projected.repoMeta).toEqual({
      stars: 42,
      defaultBranch: "main",
      pushedAt: "2026-09-10T00:00:00.000Z",
    })
  })

  it("carries the rendered description and caveats beside their raw strings", () => {
    const projected = projectPluginForDirectory({
      id: "rendered",
      repo: "example/rendered",
      url: "https://github.com/example/rendered",
      name: "Rendered",
      description: "A [Paseo](https://paseo.sh) plugin",
      descriptionNodes: [
        { type: "text", text: "A " },
        {
          type: "link",
          href: "https://paseo.sh",
          children: [{ type: "text", text: "Paseo" }],
        },
        { type: "text", text: " plugin" },
      ],
      categories: [],
      platforms: [],
      caveats: ["Needs `paseo` on PATH"],
      caveatNodes: [
        [
          { type: "text", text: "Needs " },
          { type: "text", text: "paseo", code: true },
          { type: "text", text: " on PATH" },
        ],
      ],
      health: {
        manifestValid: true,
        hasReadme: true,
        hasLicense: true,
        hasTests: true,
        hasTypecheckScript: true,
        updatedRecently: true,
      },
      images: [],
      videos: [],
      scannedAt: "2026-09-01T00:00:00.000Z",
    })

    expect(projected.description).toBe("A [Paseo](https://paseo.sh) plugin")
    expect(projected.descriptionNodes).toEqual([
      { type: "text", text: "A " },
      {
        type: "link",
        href: "https://paseo.sh",
        children: [{ type: "text", text: "Paseo" }],
      },
      { type: "text", text: " plugin" },
    ])
    expect(projected.caveatNodes).toHaveLength(projected.caveats.length)
    expect(projected.caveatNodes?.[0]?.[1]).toEqual({
      type: "text",
      text: "paseo",
      code: true,
    })
  })

  it("omits parsed caveats when their raw strings exceed the entry budget", () => {
    const projected = projectPluginForDirectory({
      id: "oversized-caveats",
      repo: "example/oversized-caveats",
      url: "https://github.com/example/oversized-caveats",
      name: "Oversized caveats",
      description: "",
      descriptionNodes: [],
      categories: [],
      platforms: [],
      caveats: Array.from({ length: 64 }, () => "c".repeat(1_000)),
      caveatNodes: Array.from({ length: 64 }, () => [
        { type: "text" as const, text: "c" },
      ]),
      health: {
        manifestValid: true,
        hasReadme: false,
        hasLicense: false,
        hasTests: false,
        hasTypecheckScript: false,
        updatedRecently: false,
      },
      images: [],
      videos: [],
      scannedAt: "2026-09-01T00:00:00.000Z",
    })

    expect(projected.caveats).toEqual([])
    expect(projected.caveatNodes).toBeUndefined()
  })

  it("preserves failed security metadata before budgeting bulky fields", () => {
    const projected = projectPluginForDirectory({
      id: "failed-security",
      repo: "example/failed-security",
      url: "https://github.com/example/failed-security",
      name: "Failed security",
      description: "",
      descriptionNodes: [],
      manifest: { payload: "m".repeat(100_000) },
      categories: [],
      platforms: [],
      caveats: [],
      caveatNodes: [],
      installNotesHtml: `<p>${"i".repeat(100_000)}</p>`,
      limitationsNotesHtml: `<p>${"l".repeat(100_000)}</p>`,
      health: {
        manifestValid: true,
        hasReadme: true,
        hasLicense: true,
        hasTests: true,
        hasTypecheckScript: true,
        updatedRecently: true,
      },
      security: {
        status: "failed",
        blockingFindings: 1,
        advisoryFindings: 2,
        scannedAt: "2026-09-10T00:00:00.000Z",
        commit: "a".repeat(40),
      },
      images: [
        "http://127.0.0.1:8080/action",
        "https://raw.githubusercontent.com/example/repo/main/shot.png",
      ],
      videos: [],
      scannedAt: "2026-09-10T00:00:00.000Z",
    })

    expect(projected.security).toMatchObject({
      status: "failed",
      blockingFindings: 1,
    })
    expect(projected.images).toEqual([
      "https://raw.githubusercontent.com/example/repo/main/shot.png",
    ])
    expect(directoryPluginSchema.safeParse(projected).success).toBe(true)
  })

  it("fails instead of truncating an install path", () => {
    expect(() =>
      projectPluginForDirectory({
        id: "overlong-path",
        repo: "example/overlong-path",
        path: "x".repeat(501),
        url: "https://github.com/example/overlong-path",
        name: "Overlong path",
        description: "",
        descriptionNodes: [],
        categories: [],
        platforms: [],
        caveats: [],
        caveatNodes: [],
        health: {
          manifestValid: true,
          hasReadme: false,
          hasLicense: false,
          hasTests: false,
          hasTypecheckScript: false,
          updatedRecently: true,
        },
        images: [],
        videos: [],
        scannedAt: "2026-09-10T00:00:00.000Z",
      })
    ).toThrow("overlong identity data")
  })
})
