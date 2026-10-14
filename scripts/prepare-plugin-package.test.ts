import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { preparePluginPackage } from "./prepare-plugin-package"

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("preparePluginPackage", () => {
  it("keeps the release version and removes the Git-only preparation command", async () => {
    const root = await mkdtemp(join(tmpdir(), "paseo-cafe-package-"))
    temporaryDirectories.push(root)
    const sourcePackageJson = JSON.parse(
      await readFile("plugin/package.json", "utf8")
    ) as Record<string, unknown>
    const destination = join(root, "package")

    await preparePluginPackage("plugin", destination, "LICENSE")

    const packageJson = JSON.parse(
      await readFile(join(destination, "package.json"), "utf8")
    ) as Record<string, unknown>
    const manifest = JSON.parse(
      await readFile(join(destination, "paseo-plugin.json"), "utf8")
    ) as Record<string, unknown>
    expect(packageJson).toMatchObject({
      name: "paseo-cafe",
      version: sourcePackageJson.version,
      publishConfig: { access: "public", provenance: true },
    })
    expect(packageJson.private).toBeUndefined()
    expect(manifest.build).toBeUndefined()
    expect(
      (await readdir(destination, { recursive: true })).filter((path) =>
        /\.test\.[cm]?[jt]sx?$/.test(path)
      )
    ).toEqual([])
    expect(await readFile(join(destination, "LICENSE"), "utf8")).toContain(
      "Apache License"
    )
    // The registry refuses to list a version whose package has no author overview.
    expect(await readFile(join(destination, "OVERVIEW.md"), "utf8")).toContain(
      "Paseo Cafe"
    )
    // README screenshots resolve relative to the package, so every one must ship.
    const readme = await readFile(join(destination, "README.md"), "utf8")
    const images = [...readme.matchAll(/\]\((images\/[^)]+)\)/g)].map(
      (match) => match[1]
    )
    expect(images.length).toBeGreaterThan(0)
    for (const image of images) {
      await expect(readFile(join(destination, image))).resolves.toBeInstanceOf(
        Buffer
      )
    }
  })

  it("rejects staging inside the plugin source", async () => {
    await expect(
      preparePluginPackage("plugin", "plugin/.npm-stage", "LICENSE")
    ).rejects.toThrow("outside the plugin source")
  })
})
