#!/usr/bin/env bun
import { cp, readdir } from "node:fs/promises"
import { join, resolve, sep } from "node:path"

/**
 * Copies Nitro's base-path prerender output into the Pages artifact root.
 * The source is intentionally retained: a valid repository name such as
 * "assets" can share this directory with files that must remain nested.
 */
export async function mergePagesArtifact(
  publicDirectory: string,
  basePath: string
): Promise<void> {
  const relativeBase = basePath.replace(/^\/+|\/+$/g, "")
  if (!relativeBase) return

  if (
    relativeBase
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid GitHub Pages base path: ${basePath}`)
  }

  const root = resolve(publicDirectory)
  const source = resolve(root, relativeBase)
  if (!source.startsWith(`${root}${sep}`)) {
    throw new Error(`GitHub Pages base path escapes artifact root: ${basePath}`)
  }

  for (const entry of await readdir(source, { withFileTypes: true })) {
    await cp(join(source, entry.name), join(root, entry.name), {
      recursive: true,
      force: true,
    })
  }
}

if (import.meta.main) {
  await mergePagesArtifact(".output/public", process.env.VITE_BASE_PATH ?? "")
}
