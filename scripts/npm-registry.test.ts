import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AbbreviatedManifest, ManifestResult } from "pacote"
import * as pacote from "pacote"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  extractNpmPackage,
  resolveNpmDownloadsLast30Days,
  resolveNpmPackage,
  resolveNpmPackageReleases,
  resolveNpmPublishedAt,
} from "./npm-registry"

vi.mock("pacote", () => ({
  manifest: vi.fn(),
  packument: vi.fn(),
  extract: vi.fn(),
}))

const release = {
  package: "@acme/paseo-plugin",
  version: "1.2.3",
  integrity: `sha512-${"a".repeat(86)}`,
  resolved:
    "https://registry.npmjs.org/@acme/paseo-plugin/-/paseo-plugin-1.2.3.tgz",
}
const PUBLISHED_AT = "2026-09-17T12:34:56.000Z"
const DOWNLOADS_LAST_30_DAYS = 1_234

const temporaryDirectories: string[] = []

beforeEach(() => {
  vi.mocked(pacote.packument).mockResolvedValue({
    name: release.package,
    "dist-tags": { latest: release.version },
    versions: {},
    time: {
      created: "2026-09-01T00:00:00.000Z",
      modified: PUBLISHED_AT,
      [release.version]: PUBLISHED_AT,
    },
  } as never)
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        downloads: DOWNLOADS_LAST_30_DAYS,
        start: "2026-08-19",
        end: "2026-09-17",
        package: release.package,
      })
    )
  )
})

afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
  vi.unstubAllGlobals()
})

describe("npm registry resolution", () => {
  it("accepts only exact public npmjs metadata", async () => {
    vi.mocked(pacote.manifest).mockResolvedValue({
      name: release.package,
      version: release.version,
      deprecated: undefined,
      dist: {},
      _id: `${release.package}@${release.version}`,
      _from: `${release.package}@latest`,
      _integrity: release.integrity,
      _resolved: release.resolved,
    } as AbbreviatedManifest & ManifestResult)

    await expect(resolveNpmPackage(release.package)).resolves.toMatchObject(
      release
    )
    expect(pacote.packument).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()

    await expect(
      resolveNpmPublishedAt(release.package, release.version)
    ).resolves.toBe(PUBLISHED_AT)
    await expect(resolveNpmDownloadsLast30Days(release.package)).resolves.toBe(
      DOWNLOADS_LAST_30_DAYS
    )
    expect(fetch).toHaveBeenCalledWith(
      "https://api.npmjs.org/downloads/point/last-month/%40acme%2Fpaseo-plugin",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("resolves a distinct next release from the same packument", async () => {
    vi.mocked(pacote.packument).mockResolvedValue({
      name: release.package,
      "dist-tags": { latest: "1.2.3", next: "1.3.0-next.1" },
      versions: {
        "1.2.3": {
          name: release.package,
          version: "1.2.3",
          dist: { integrity: release.integrity, tarball: release.resolved },
        },
        "1.3.0-next.1": {
          name: release.package,
          version: "1.3.0-next.1",
          dist: {
            integrity: `sha512-${"b".repeat(86)}`,
            tarball:
              "https://registry.npmjs.org/@acme/paseo-plugin/-/paseo-plugin-1.3.0-next.1.tgz",
          },
        },
      },
      time: {
        "1.2.3": PUBLISHED_AT,
        "1.3.0-next.1": "2026-09-18T12:34:56.000Z",
      },
    } as never)

    await expect(
      resolveNpmPackageReleases(release.package)
    ).resolves.toMatchObject({
      latest: { version: "1.2.3" },
      next: { version: "1.3.0-next.1" },
    })
  })

  it("omits a malformed next tag without hiding latest", async () => {
    vi.mocked(pacote.packument).mockResolvedValue({
      name: release.package,
      "dist-tags": { latest: release.version, next: "not-semver" },
      versions: {
        [release.version]: {
          name: release.package,
          version: release.version,
          dist: { integrity: release.integrity, tarball: release.resolved },
        },
      },
      time: { [release.version]: PUBLISHED_AT },
    } as never)

    await expect(resolveNpmPackageReleases(release.package)).resolves.toEqual({
      latest: expect.objectContaining({ version: release.version }),
      next: undefined,
    })
  })

  it("rejects selectors and tarballs before contacting npm", async () => {
    await expect(resolveNpmPackage("@acme/paseo-plugin@1.2.3")).rejects.toThrow(
      "Invalid npm package name"
    )
    await expect(
      resolveNpmPackage("https://registry.npmjs.org/plugin.tgz")
    ).rejects.toThrow("Invalid npm package name")
    expect(pacote.manifest).not.toHaveBeenCalled()
  })

  it("treats a new package with no download history as zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 }))
    )

    await expect(resolveNpmDownloadsLast30Days(release.package)).resolves.toBe(
      0
    )
  })

  it("rejects package metadata that resolves outside npmjs", async () => {
    vi.mocked(pacote.manifest).mockResolvedValue({
      name: release.package,
      version: release.version,
      deprecated: undefined,
      dist: {},
      _id: `${release.package}@${release.version}`,
      _from: `${release.package}@latest`,
      _integrity: release.integrity,
      _resolved: "https://attacker.example/plugin.tgz",
    } as AbbreviatedManifest & ManifestResult)

    await expect(resolveNpmPackage(release.package)).rejects.toThrow(
      "resolved outside npmjs.org"
    )
  })

  it("rejects malformed download counts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ downloads: -1, package: release.package })
      )
    )

    await expect(
      resolveNpmDownloadsLast30Days(release.package)
    ).rejects.toThrow("invalid download count")
  })

  it("verifies extracted package identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "paseo-cafe-npm-test-"))
    temporaryDirectories.push(directory)
    vi.mocked(pacote.extract).mockImplementation(async (_spec, destination) => {
      if (!destination) throw new Error("missing destination")
      await mkdir(destination, { recursive: true })
      await writeFile(
        join(destination, "package.json"),
        JSON.stringify({ name: release.package, version: "9.9.9" })
      )
      return {
        from: `${release.package}@${release.version}`,
        integrity: release.integrity,
        resolved: release.resolved,
      }
    })

    await expect(extractNpmPackage(release, directory)).rejects.toThrow(
      "archive metadata does not match npm"
    )
  })
})
