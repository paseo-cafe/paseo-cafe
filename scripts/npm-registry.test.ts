import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AbbreviatedManifest, ManifestResult } from "pacote"
import * as pacote from "pacote"
import { afterEach, describe, expect, it, vi } from "vitest"
import { extractNpmPackage, resolveNpmPackage } from "./npm-registry"

vi.mock("pacote", () => ({
  manifest: vi.fn(),
  extract: vi.fn(),
}))

const release = {
  package: "@acme/paseo-plugin",
  version: "1.2.3",
  integrity: `sha512-${"a".repeat(86)}`,
  resolved:
    "https://registry.npmjs.org/@acme/paseo-plugin/-/paseo-plugin-1.2.3.tgz",
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
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
