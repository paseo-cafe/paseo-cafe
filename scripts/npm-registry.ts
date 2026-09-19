import { lstat, readdir, readFile } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import * as pacote from "pacote"
import * as semver from "semver"
import {
  isValidCatalogPackage,
  isValidCatalogVersion,
} from "../plugin/shared/catalog"

const NPM_REGISTRY = "https://registry.npmjs.org/"
const NPM_DOWNLOADS_API = "https://api.npmjs.org/downloads/point/last-month/"
const MAX_PACKAGE_FILES = 5_000
const MAX_PACKAGE_BYTES = 64 * 1_024 * 1_024
const MAX_SINGLE_FILE_BYTES = 4 * 1_024 * 1_024

export interface NpmPackageRelease {
  package: string
  version: string
  integrity: string
  resolved: string
  publishedAt?: string
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

interface NpmDownloadCount {
  downloads: number
  package: string
}

export async function resolveNpmDownloadsLast30Days(
  packageName: string
): Promise<number> {
  if (!isValidCatalogPackage(packageName)) {
    throw new Error(`Invalid npm package name: ${packageName}`)
  }
  const response = await fetch(
    `${NPM_DOWNLOADS_API}${encodeURIComponent(packageName)}`,
    { signal: AbortSignal.timeout(15_000) }
  )
  if (response.status === 404) return 0
  if (!response.ok) {
    throw new Error(
      `${packageName} download count failed with HTTP ${response.status}`
    )
  }
  const result = (await response.json()) as Partial<NpmDownloadCount>
  if (
    result.package !== packageName ||
    !Number.isSafeInteger(result.downloads) ||
    (result.downloads ?? -1) < 0
  ) {
    throw new Error(`${packageName} returned an invalid download count`)
  }
  return result.downloads as number
}

export async function resolveNpmPublishedAt(
  packageName: string,
  version: string,
  cache?: string
): Promise<string> {
  if (!isValidCatalogPackage(packageName) || !isValidCatalogVersion(version)) {
    throw new Error(`Invalid npm package release: ${packageName}@${version}`)
  }
  const packument = await pacote.packument(
    packageName,
    pacoteOptions(cache) as pacote.Options & { fullMetadata: true }
  )
  if (
    packument.name !== packageName ||
    packument["dist-tags"].latest !== version
  ) {
    throw new Error(`${packageName}@${version} changed during metadata lookup`)
  }
  const publishedAt = packument.time[version]
  if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) {
    throw new Error(`${packageName}@${version} has no valid publication date`)
  }
  return publishedAt
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
export async function resolveNpmPackageReleases(
  packageName: string,
  cache?: string
): Promise<{ latest?: NpmPackageRelease; next?: NpmPackageRelease }> {
  if (!isValidCatalogPackage(packageName)) {
    throw new Error(`Invalid npm package name: ${packageName}`)
  }
  const packument = await pacote.packument(
    packageName,
    pacoteOptions(cache) as pacote.Options & { fullMetadata: true }
  )
  if (packument.name !== packageName) {
    throw new Error(`npm returned package ${packument.name} for ${packageName}`)
  }
  const releaseFor = (
    tag: "latest" | "next"
  ): NpmPackageRelease | undefined => {
    const taggedVersion = packument["dist-tags"]?.[tag]
    const manifest = taggedVersion
      ? packument.versions?.[taggedVersion]
      : undefined
    const version = semver.valid(taggedVersion)
    const publishedAt = version ? packument.time?.[version] : undefined
    if (
      !version ||
      version === "0.0.0" ||
      !manifest ||
      manifest.name !== packageName ||
      semver.valid(manifest.version) !== version ||
      !publishedAt ||
      !Number.isFinite(Date.parse(publishedAt)) ||
      !manifest.dist?.integrity?.startsWith("sha512-") ||
      !manifest.dist?.tarball ||
      !trustedTarballUrl(manifest.dist.tarball) ||
      (manifest.dist.fileCount ?? 0) > MAX_PACKAGE_FILES ||
      (manifest.dist.unpackedSize ?? 0) > MAX_PACKAGE_BYTES
    ) {
      return undefined
    }
    return {
      package: packageName,
      version,
      integrity: manifest.dist.integrity,
      resolved: manifest.dist.tarball,
      publishedAt,
      description:
        typeof manifest.description === "string"
          ? manifest.description
          : undefined,
      license:
        typeof manifest.license === "string" ? manifest.license : undefined,
      repository: manifest.repository,
    }
  }
  return { latest: releaseFor("latest"), next: releaseFor("next") }
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
