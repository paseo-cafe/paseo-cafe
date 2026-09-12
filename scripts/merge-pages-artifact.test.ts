import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { mergePagesArtifact } from "./merge-pages-artifact"

const temporaryDirectories: string[] = []

async function temporaryArtifact(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pages-artifact-"))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("mergePagesArtifact", () => {
  it("does nothing for a root deployment", async () => {
    const root = await temporaryArtifact()
    await writeFile(join(root, "index.html"), "canonical")

    await mergePagesArtifact(root, "")

    expect(await readFile(join(root, "index.html"), "utf8")).toBe("canonical")
  })

  it("retains a base directory that collides with an asset directory", async () => {
    const root = await temporaryArtifact()
    const source = join(root, "assets")
    await mkdir(source)
    await writeFile(join(source, "index.html"), "fork home")
    await writeFile(join(source, "bundle.js"), "asset")

    await mergePagesArtifact(root, "/assets")

    expect(await readFile(join(root, "index.html"), "utf8")).toBe("fork home")
    expect(await readFile(join(root, "bundle.js"), "utf8")).toBe("asset")
    expect(await readFile(join(source, "bundle.js"), "utf8")).toBe("asset")
  })

  it("rejects a base path that escapes the artifact root", async () => {
    const root = await temporaryArtifact()

    await expect(mergePagesArtifact(root, "/../outside")).rejects.toThrow(
      "Invalid GitHub Pages base path"
    )
  })
})
