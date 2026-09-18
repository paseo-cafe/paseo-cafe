#!/usr/bin/env bun
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path"

const PACKAGE_FILES = [
  "client",
  "images",
  "server",
  "shared",
  "index.client.tsx",
  "index.server.ts",
  "README.md",
] as const

export async function preparePluginPackage(
  sourceDirectory: string,
  destinationDirectory: string,
  licensePath: string
): Promise<void> {
  const source = resolve(sourceDirectory)
  const destination = resolve(destinationDirectory)
  const destinationFromSource = relative(source, destination)
  const destinationIsInsideSource =
    destinationFromSource === "" ||
    (!isAbsolute(destinationFromSource) &&
      destinationFromSource !== ".." &&
      !destinationFromSource.startsWith(`..${sep}`))
  if (destinationIsInsideSource) {
    throw new Error(
      "Published package staging must be outside the plugin source"
    )
  }

  const packageJson = JSON.parse(
    await readFile(join(source, "package.json"), "utf8")
  ) as Record<string, unknown>
  const manifest = JSON.parse(
    await readFile(join(source, "paseo-plugin.json"), "utf8")
  ) as Record<string, unknown>
  delete packageJson.private
  packageJson.repository = {
    type: "git",
    url: "git+https://github.com/paseo-cafe/paseo-cafe.git",
    directory: "plugin",
  }
  packageJson.homepage = "https://paseo.cafe/plugins/paseo-cafe"
  packageJson.bugs = {
    url: "https://github.com/paseo-cafe/paseo-cafe/issues",
  }
  packageJson.publishConfig = { access: "public", provenance: true }
  packageJson.files = [...PACKAGE_FILES, "paseo-plugin.json", "LICENSE"]
  delete manifest.build

  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  await Promise.all(
    PACKAGE_FILES.map((path) =>
      cp(join(source, path), join(destination, path), { recursive: true })
    )
  )
  const stagedPaths = await readdir(destination, { recursive: true })
  await Promise.all(
    stagedPaths
      .filter((path) => /\.test\.[cm]?[jt]sx?$/.test(path))
      .map((path) => rm(join(destination, path), { force: true }))
  )
  await cp(licensePath, join(destination, basename(licensePath)))
  await writeFile(
    join(destination, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`
  )
  await writeFile(
    join(destination, "paseo-plugin.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
}

if (import.meta.main) {
  const destination = process.argv[2]
  if (!destination)
    throw new Error("Usage: prepare-plugin-package.ts <destination>")
  await preparePluginPackage("plugin", destination, "LICENSE")
}
