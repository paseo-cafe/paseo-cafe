import { afterEach, describe, expect, it, vi } from "vitest"
import type { InstalledPlugin } from "../shared/directory"
import {
  DEFAULT_DIRECTORY_URL,
  findInstallations,
  installedPluginSchema,
} from "../shared/directory"
import {
  buildPaseoInvocation,
  inspectUpdateStatus,
  installDirectoryPlugin,
  listDirectory,
  mapWithConcurrency,
  searchDirectory,
  updateDirectoryPlugin,
} from "./directory"

const originalFetch = globalThis.fetch
const originalDirectoryUrl = process.env.PASEO_CAFE_DIRECTORY_URL

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

const CURRENT = "a".repeat(40)
const LATEST = "b".repeat(40)

function gitInstallation(
  overrides: Partial<InstalledPlugin> = {}
): InstalledPlugin {
  return {
    id: "review",
    path: "/tmp/version/checkout/plugins/review",
    enabled: true,
    status: "running",
    source: "git",
    remote: "https://github.com/acme/plugins.git",
    ref: "main",
    commit: CURRENT,
    updateState: "unknown",
    ...overrides,
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  if (originalDirectoryUrl === undefined) {
    delete process.env.PASEO_CAFE_DIRECTORY_URL
  } else {
    process.env.PASEO_CAFE_DIRECTORY_URL = originalDirectoryUrl
  }
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
      redirect: "error",
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

describe("catalog transport policy", () => {
  it("rejects an untrusted explicit URL before fetching it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await expect(
      listDirectory({
        baseUrl: "http://catalog.internal/api/plugins",
        force: true,
      })
    ).rejects.toThrow("Catalog URL must use HTTPS, or HTTP on localhost.")
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("fails closed when fetching a catalog encounters a redirect", async () => {
    const trustedUrl = "https://catalog.example/api/plugins"
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(
        new TypeError(`UnexpectedRedirect fetching ${trustedUrl}`)
      )

    await expect(
      listDirectory({ baseUrl: trustedUrl, force: true })
    ).rejects.toThrow("UnexpectedRedirect")
    expect(fetchSpy).toHaveBeenCalledWith(
      trustedUrl,
      expect.objectContaining({ redirect: "error" })
    )
  })

  it("redacts and warns once about a rejected environment URL", async () => {
    const username = "catalog-user"
    const password = "catalog-credential"
    const token = "signed-query-value"
    const rejectedUrl = new URL("http://catalog.example/api/plugins")
    rejectedUrl.username = username
    rejectedUrl.password = password
    rejectedUrl.searchParams.set("token", token)
    rejectedUrl.hash = "private"
    process.env.PASEO_CAFE_DIRECTORY_URL = rejectedUrl.href
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 503,
        statusText: "Service Unavailable",
      })
    )

    await expect(listDirectory({ force: true })).rejects.toThrow(
      `${DEFAULT_DIRECTORY_URL} returned 503 Service Unavailable`
    )
    await expect(listDirectory({ force: true })).rejects.toThrow(
      `${DEFAULT_DIRECTORY_URL} returned 503 Service Unavailable`
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      DEFAULT_DIRECTORY_URL,
      expect.any(Object)
    )
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith(
      "Ignoring PASEO_CAFE_DIRECTORY_URL: catalog URL must use HTTPS, or HTTP on localhost."
    )
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain(username)
    expect(logged).not.toContain(password)
    expect(logged).not.toContain(token)
    expect(logged).not.toContain("catalog.example")
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

describe("catalog installation matching", () => {
  it("does not bind an equal runtime ID to a different Git source", () => {
    const matches = findInstallations(
      { id: "review", repo: "trusted/review" },
      [gitInstallation({ remote: "https://github.com/attacker/fork.git" })]
    )

    expect(matches).toEqual([])
  })

  it("returns every alias for the same repository and plugin path", () => {
    const matches = findInstallations(
      { id: "review", repo: "acme/plugins", path: "plugins/review" },
      [
        gitInstallation({ id: "review" }),
        gitInstallation({
          id: "review-canary",
          remote: "git://github.com/acme/plugins.git",
        }),
        gitInstallation({
          id: "other",
          path: "/tmp/version/checkout/plugins/other",
        }),
      ]
    )

    expect(matches.map((installation) => installation.id)).toEqual([
      "review",
      "review-canary",
    ])
  })

  it("normalizes root plugin paths", () => {
    const matches = findInstallations(
      { id: "review", repo: "acme/plugins", path: "." },
      [gitInstallation({ id: "alias", path: "/tmp/version/checkout" })]
    )

    expect(matches).toHaveLength(1)
  })

  it("matches directory installations only by their runtime ID", () => {
    const installation = gitInstallation({
      source: "directory",
      remote: undefined,
      id: "review",
    })

    expect(
      findInstallations({ id: "review", repo: "other/repo" }, [installation])
    ).toEqual([installation])
  })

  it("defaults missing update state to unknown for mixed bundle versions", () => {
    const parsed = installedPluginSchema.parse({
      id: "review",
      path: "/tmp/review",
      enabled: true,
      status: "running",
    })

    expect(parsed.updateState).toBe("unknown")
  })
})

describe("update status classification", () => {
  it("keeps tags and commits pinned when no tracked branch existed at install", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", exitCode: 1 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })

    const result = await inspectUpdateStatus(
      gitInstallation({ ref: "v1.0.0" }),
      runGit
    )

    expect(result.updateState).toBe("pinned")
    expect(runGit).toHaveBeenCalledTimes(2)
  })

  it("reports a deleted tracked branch as unavailable rather than pinned", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", exitCode: 1 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 1 })

    const result = await inspectUpdateStatus(gitInstallation(), runGit)

    expect(result.updateState).toBe("unknown")
    expect(result.updateError).toContain("Tracked branch is unavailable")
  })

  it("reports current only after fetching and resolving the tracked branch", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: `${CURRENT}\n`, exitCode: 0 })

    const result = await inspectUpdateStatus(gitInstallation(), runGit)

    expect(result.updateState).toBe("current")
    expect(result.latestCommit).toBe(CURRENT)
  })

  it("offers an update only when the installed commit is an ancestor", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: `${LATEST}\n`, exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })

    const result = await inspectUpdateStatus(gitInstallation(), runGit)

    expect(result.updateState).toBe("available")
    expect(result.latestCommit).toBe(LATEST)
  })

  it("does not offer an update for a diverged source", async () => {
    const runGit = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 0 })
      .mockResolvedValueOnce({ stdout: `${LATEST}\n`, exitCode: 0 })
      .mockResolvedValueOnce({ stdout: "", exitCode: 1 })

    const result = await inspectUpdateStatus(gitInstallation(), runGit)

    expect(result.updateState).toBe("diverged")
  })

  it("preserves an explicit unknown state when the remote check fails", async () => {
    const result = await inspectUpdateStatus(gitInstallation(), async () => {
      throw new Error("offline")
    })

    expect(result.updateState).toBe("unknown")
    expect(result.updateError).toContain("offline")
  })
})

describe("update target validation", () => {
  it("refuses to update Paseo Cafe from its own running process", async () => {
    const result = await updateDirectoryPlugin({
      pluginId: "paseo-cafe",
      entry: { id: "paseo-cafe", repo: "paseo-cafe/paseo-cafe" },
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain("outside the running plugin")
  })
})

describe("Paseo CLI invocation", () => {
  it("disables inherited Electron Node mode on Unix", () => {
    expect(
      buildPaseoInvocation(["plugin", "ls", "--json"], "linux", {
        ELECTRON_RUN_AS_NODE: "1",
        PATH: "/usr/bin",
      })
    ).toEqual({
      executable: "paseo",
      args: ["plugin", "ls", "--json"],
      env: { PATH: "/usr/bin" },
    })
  })

  it("quotes the npm command shim invocation on Windows", () => {
    const invocation = buildPaseoInvocation(
      ["plugin", "update", "review", "--json"],
      "win32"
    )

    expect(invocation.args).toEqual([
      "/d",
      "/s",
      "/c",
      '"paseo" "plugin" "update" "review" "--json"',
    ])
  })

  it("rejects Windows command metacharacters", () => {
    expect(() =>
      buildPaseoInvocation(["plugin", "update", "review&calc"], "win32")
    ).toThrow("unsupported Windows shell characters")
  })
})

describe("bounded update checks", () => {
  it("never runs more than the configured number of workers", async () => {
    let active = 0
    let maximum = 0
    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5, 6],
      2,
      async (value) => {
        active += 1
        maximum = Math.max(maximum, active)
        await Promise.resolve()
        active -= 1
        return value * 2
      }
    )

    expect(maximum).toBe(2)
    expect(results).toEqual([2, 4, 6, 8, 10, 12])
  })
})
