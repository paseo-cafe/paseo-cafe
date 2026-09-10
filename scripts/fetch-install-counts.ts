#!/usr/bin/env bun
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import {
  failedInstallCountsSnapshot,
  type InstallCountsSnapshot,
  parseCafeCounts,
  parseInstallCountsSnapshot,
  receivedInstallCountsSnapshot,
  reclassifyInstallCountsSnapshot,
} from "../src/lib/install-counts.ts"
import { registryIdSchema } from "../src/lib/registry-schema.ts"

const DEFAULT_SERVICE_URL = "https://api.paseo.cafe"
const DEFAULT_PREVIOUS_SNAPSHOT_URL = "https://paseo.cafe/api/install-counts"
const FETCH_TIMEOUT_MS = 5_000
const MAX_RESPONSE_BYTES = 64 * 1024

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true
  const octets = hostname.split(".")
  return (
    octets.length === 4 &&
    octets[0] === "127" &&
    octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255)
  )
}

export function countsEndpoint(serviceUrl: string): URL {
  const base = new URL(serviceUrl)
  const isAllowedHttp =
    base.protocol === "http:" && isLoopbackHostname(base.hostname)
  if (base.protocol !== "https:" && !isAllowedHttp) {
    throw new Error("Cafe service URL must use HTTPS or loopback HTTP")
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error(
      "Cafe service URL must not contain credentials or parameters"
    )
  }
  if (base.pathname !== "/" && base.pathname !== "") {
    throw new Error("Cafe service URL must be an origin without a path")
  }
  return new URL("/v1/counts", base)
}

export function previousSnapshotEndpoint(value: string): URL {
  const endpoint = new URL(value)
  const isAllowedHttp =
    endpoint.protocol === "http:" && isLoopbackHostname(endpoint.hostname)
  if (endpoint.protocol !== "https:" && !isAllowedHttp) {
    throw new Error("Previous snapshot URL must use HTTPS or loopback HTTP")
  }
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      "Previous snapshot URL must not contain credentials or parameters"
    )
  }
  return endpoint
}

function catalogIds(registryDirectory: string): string[] {
  return readdirSync(registryDirectory)
    .filter((file) => file.endsWith(".json"))
    .map((file) => registryIdSchema.parse(file.slice(0, -".json".length)))
    .sort()
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`Cafe service returned ${response.status}`)

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("Cafe service did not return JSON")
  }

  const declaredLength = response.headers.get("content-length")
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAX_RESPONSE_BYTES
  ) {
    throw new Error("Cafe service response is too large")
  }
  if (response.body === null) throw new Error("Cafe service returned no body")

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  const reader = response.body.getReader()
  while (true) {
    const result = await reader.read()
    if (result.done) break
    totalBytes += result.value.byteLength
    if (totalBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new Error("Cafe service response is too large")
    }
    chunks.push(result.value)
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
}

export async function fetchPublishedCounts(
  endpoint: URL,
  ids: readonly string[],
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(endpoint, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  return parseCafeCounts(await boundedJson(response), ids)
}

async function fetchPreviousSnapshot(
  endpoint: URL,
  ids: readonly string[],
  fetcher: typeof fetch
): Promise<InstallCountsSnapshot> {
  const response = await fetcher(endpoint, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  return parseInstallCountsSnapshot(await boundedJson(response), ids)
}

function readPreviousSnapshot(outputPath: string): unknown {
  try {
    return JSON.parse(readFileSync(outputPath, "utf8"))
  } catch {
    return undefined
  }
}

function writeSnapshot(
  outputPath: string,
  snapshot: InstallCountsSnapshot
): void {
  mkdirSync(dirname(outputPath), { recursive: true })
  const temporaryPath = `${outputPath}.tmp`
  writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  renameSync(temporaryPath, outputPath)
}

export function ensureExistingInstallCounts({
  registryDirectory,
  outputPath,
  observedAt = new Date().toISOString(),
}: {
  registryDirectory: string
  outputPath: string
  observedAt?: string
}): InstallCountsSnapshot {
  const ids = catalogIds(registryDirectory)
  let snapshot: InstallCountsSnapshot
  try {
    snapshot = reclassifyInstallCountsSnapshot(
      readPreviousSnapshot(outputPath),
      ids,
      observedAt
    )
  } catch {
    snapshot = failedInstallCountsSnapshot(undefined, observedAt, ids)
  }
  writeSnapshot(outputPath, snapshot)
  return snapshot
}

export async function fetchAndWriteInstallCounts({
  serviceUrl,
  previousSnapshotUrl,
  registryDirectory,
  outputPath,
  now = () => new Date(),
  fetcher = fetch,
}: {
  serviceUrl: string
  previousSnapshotUrl?: string
  registryDirectory: string
  outputPath: string
  now?: () => Date
  fetcher?: typeof fetch
}): Promise<InstallCountsSnapshot> {
  const ids = catalogIds(registryDirectory)
  let previous = readPreviousSnapshot(outputPath)
  try {
    previous = parseInstallCountsSnapshot(previous, ids)
  } catch {
    previous = undefined
  }
  const endpoint = countsEndpoint(serviceUrl)
  const fallbackEndpoint = previousSnapshotUrl
    ? previousSnapshotEndpoint(previousSnapshotUrl)
    : undefined

  let snapshot: InstallCountsSnapshot
  try {
    const data = await fetchPublishedCounts(endpoint, ids, fetcher)
    const fetchedAt = now().toISOString()
    snapshot = receivedInstallCountsSnapshot(data, fetchedAt, ids)
  } catch {
    let fallback = previous
    if (fallback === undefined && fallbackEndpoint) {
      try {
        fallback = await fetchPreviousSnapshot(fallbackEndpoint, ids, fetcher)
      } catch {
        // No local or deployed valid snapshot exists; publish unavailable.
      }
    }
    const attemptedAt = now().toISOString()
    snapshot = failedInstallCountsSnapshot(fallback, attemptedAt, ids)
  }

  writeSnapshot(outputPath, snapshot)
  return snapshot
}

async function main(): Promise<void> {
  const root = process.cwd()
  const outputPath = join(root, "data", "install-counts.json")
  if (process.argv.includes("--if-missing") && existsSync(outputPath)) {
    ensureExistingInstallCounts({
      registryDirectory: join(root, "registry"),
      outputPath,
    })
    return
  }
  const serviceUrl =
    process.env.PASEO_CAFE_SERVICE_URL?.trim() || DEFAULT_SERVICE_URL
  const previousSnapshotUrl =
    process.env.PASEO_CAFE_PREVIOUS_COUNTS_URL?.trim() ||
    DEFAULT_PREVIOUS_SNAPSHOT_URL
  const snapshot = await fetchAndWriteInstallCounts({
    serviceUrl,
    previousSnapshotUrl,
    registryDirectory: join(root, "registry"),
    outputPath,
  })

  if (snapshot.status === "available") {
    console.log("Wrote current Cafe install counts to data/install-counts.json")
  } else if (snapshot.status === "stale") {
    console.warn(
      "Cafe install counts are stale; wrote the last published aggregate"
    )
  } else {
    console.warn(
      "Cafe install counts unavailable; wrote an explicit unavailable snapshot"
    )
  }
}

if (import.meta.main) await main()
