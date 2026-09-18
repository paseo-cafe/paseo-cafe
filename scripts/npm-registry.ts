import { lstat, readdir, readFile } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import * as pacote from "pacote"
import * as semver from "semver"
import { isValidCatalogPackage } from "../plugin/shared/catalog"

const NPM_REGISTRY = "https://registry.npmjs.org/"
const MAX_PACKAGE_FILES = 5_000
const MAX_PACKAGE_BYTES = 64 * 1_024 * 1_024
const MAX_SINGLE_FILE_BYTES = 4 * 1_024 * 1_024

export interface NpmPackageRelease {
  package: string
  version: string
  integrity: string
  resolved: string
  description?: string
  license?: string
  repository?: { type?: string; url?: string; directory?: string }
}

function pacoteOptions(cache?: string): pacote.Options {
  return {
    cache,
    registry: NPM_REGISTRY,
    fullMetadata: true,
    preferOnline: true,
  }
}

function trustedTarballUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      url.hostname === "registry.npmjs.org" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    )
  } catch {
    return false
  }
}

export async function resolveNpmPackage(
  packageName: string,
  cache?: string
): Promise<NpmPackageRelease> {
  if (!isValidCatalogPackage(packageName)) {
    throw new Error(`Invalid npm package name: ${packageName}`)
  }
  const manifest = await pacote.manifest(
    `${packageName}@latest`,
    pacoteOptions(cache) as pacote.Options & { fullMetadata: true }
  )
  const version = semver.valid(manifest.version)
  if (!version || version === "0.0.0") {
    throw new Error(`${packageName} must publish a real semantic version`)
  }
  if (manifest.name !== packageName) {
    throw new Error(`npm returned package ${manifest.name} for ${packageName}`)
  }
  if (!manifest._integrity?.startsWith("sha512-")) {
    throw new Error(`${packageName}@${version} has no SHA-512 integrity`)
  }
  if (!trustedTarballUrl(manifest._resolved)) {
    throw new Error(`${packageName}@${version} resolved outside npmjs.org`)
  }
  if (
    (manifest.dist.fileCount ?? 0) > MAX_PACKAGE_FILES ||
    (manifest.dist.unpackedSize ?? 0) > MAX_PACKAGE_BYTES
  ) {
    throw new Error(`${packageName}@${version} exceeds package size limits`)
  }
  return {
    package: packageName,
    version,
    integrity: manifest._integrity,
    resolved: manifest._resolved,
    description:
      typeof manifest.description === "string"
        ? manifest.description
        : undefined,
    license:
      typeof manifest.license === "string" ? manifest.license : undefined,
    repository: manifest.repository,
  }
}

export async function extractNpmPackage(
  release: NpmPackageRelease,
  destination: string,
  cache?: string
): Promise<void> {
  const extracted = await pacote.extract(
    `${release.package}@${release.version}`,
    destination,
    {
      ...pacoteOptions(cache),
      resolved: release.resolved,
      integrity: release.integrity,
    }
  )
  if (
    extracted.integrity !== release.integrity ||
    extracted.resolved !== release.resolved
  ) {
    throw new Error(
      `${release.package}@${release.version} changed during download`
    )
  }
  await validateExtractedPackage(destination)
  const packageJson = await readNpmPackageJson(destination)
  if (
    packageJson.name !== release.package ||
    packageJson.version !== release.version
  ) {
    throw new Error(
      `${release.package}@${release.version} archive metadata does not match npm`
    )
  }
}

async function validateExtractedPackage(root: string): Promise<void> {
  const rootPath = resolve(root)
  const pending = [rootPath]
  let files = 0
  let bytes = 0
  while (pending.length > 0) {
    const directory = pending.pop()
    if (!directory) break
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      const relativePath = relative(rootPath, path)
      if (
        relativePath.startsWith(`..${sep}`) ||
        relativePath === ".." ||
        relativePath.includes(`..${sep}`)
      ) {
        throw new Error("npm package escaped its extraction directory")
      }
      const stat = await lstat(path)
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error(
          `npm package contains unsupported entry ${relativePath}`
        )
      }
      if (stat.isDirectory()) {
        pending.push(path)
        continue
      }
      files += 1
      bytes += stat.size
      if (
        files > MAX_PACKAGE_FILES ||
        bytes > MAX_PACKAGE_BYTES ||
        stat.size > MAX_SINGLE_FILE_BYTES
      ) {
        throw new Error("npm package exceeds extraction limits")
      }
    }
  }
}

export async function readNpmPackageJson(
  directory: string
): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(join(directory, "package.json"), "utf8")
  ) as Record<string, unknown>
}
