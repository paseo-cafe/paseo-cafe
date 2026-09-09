import { afterEach, describe, expect, it, vi } from "vitest"
import {
  installDirectoryPlugin,
  listDirectory,
  searchDirectory,
} from "./directory"

const originalFetch = globalThis.fetch

function plugin(overrides: Record<string, unknown> = {}) {
  return {
    id: "catalog",
    repo: "paseo-cafe/catalog",
    url: "https://github.com/paseo-cafe/catalog",
    name: "Catalog",
    description: "Browse plugins",
    categories: ["productivity"],
    platforms: ["linux"],
    caveats: [],
    repoMeta: { stars: 10 },
    ...overrides,
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe("listDirectory", () => {
  it("fetches, validates, and caches a catalog by URL", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        generatedAt: "2026-09-09T12:00:00.000Z",
        plugins: [plugin()],
      })
    )
    globalThis.fetch = fetcher as typeof fetch
    const baseUrl = "https://catalog.example.test/api/plugins"

    const first = await listDirectory({ baseUrl, force: false })
    const second = await listDirectory({ baseUrl, force: false })

    expect(first).toEqual(second)
    expect(first.fetchedAt).toBe("2026-09-09T12:00:00.000Z")
    expect(first.plugins[0]).toMatchObject({
      id: "catalog",
      categories: ["productivity"],
    })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith(baseUrl, {
      signal: expect.any(AbortSignal),
      headers: { accept: "application/json" },
    })
  })

  it("reports a failed catalog response", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("unavailable", {
          status: 503,
          statusText: "Service Unavailable",
        })
    ) as typeof fetch

    await expect(
      listDirectory({
        baseUrl: "https://unavailable.example.test/plugins",
        force: true,
      })
    ).rejects.toThrow(
      "https://unavailable.example.test/plugins returned 503 Service Unavailable"
    )
  })
})

describe("searchDirectory", () => {
  it("matches catalog metadata, sorts by stars, and returns agent-ready text", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        generatedAt: "2026-09-09T12:00:00.000Z",
        plugins: [
          plugin({ id: "small", name: "Small", repoMeta: { stars: 1 } }),
          plugin({
            id: "popular",
            name: "Popular",
            repo: "acme/popular",
            repoMeta: { stars: 50 },
          }),
        ],
      })
    ) as typeof fetch

    const result = await searchDirectory({ query: "productivity" })

    expect([result.items[0]?.id, result.items[1]?.id]).toEqual([
      "popular",
      "small",
    ])
    expect(result.items[0]?.text).toContain(
      "Install: paseo plugin add acme/popular"
    )
    expect(result.items[0]?.text).toContain(
      "Paseo plugins are trusted, unsandboxed code."
    )
  })
})

describe("installDirectoryPlugin", () => {
  it("rejects untrusted repository and path values before spawning Paseo", async () => {
    await expect(
      installDirectoryPlugin({ repo: "acme/plugin --ref main" })
    ).resolves.toEqual({
      ok: false,
      message: `"acme/plugin --ref main" doesn't look like a GitHub "owner/repo".`,
    })
    await expect(
      installDirectoryPlugin({ repo: "acme/plugin", path: "../outside" })
    ).resolves.toEqual({
      ok: false,
      message: `"../outside" isn't a valid plugin subpath.`,
    })
  })
})
