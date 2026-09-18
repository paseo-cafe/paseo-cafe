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
  })
})
