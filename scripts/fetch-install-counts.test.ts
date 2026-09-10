import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import {
  countsEndpoint,
  ensureExistingInstallCounts,
  fetchAndWriteInstallCounts,
  previousSnapshotEndpoint,
} from "./fetch-install-counts.ts"

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cafe-install-counts-"))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  const registryDirectory = join(root, "registry")
  mkdirSync(registryDirectory)
  mkdirSync(join(root, "data"))
  writeFileSync(join(registryDirectory, "alpha-plugin.json"), "{}")
  writeFileSync(join(registryDirectory, "beta-plugin.json"), "{}")
  return {
    outputPath: join(root, "data", "install-counts.json"),
    registryDirectory,
  }
}

const responseBody = {
  schemaVersion: 1,
  asOf: "2026-09-10T00:00:00.000Z",
  trackingSince: "2026-09-08T12:00:00.000Z",
  counts: { "alpha-plugin": 2, "beta-plugin": 0 },
}

describe("fetch-install-counts", () => {
  it("accepts HTTPS and loopback HTTP service origins only", () => {
    expect(countsEndpoint("https://api.paseo.cafe").href).toBe(
      "https://api.paseo.cafe/v1/counts"
    )
    expect(countsEndpoint("http://127.0.0.1:8787").href).toBe(
      "http://127.0.0.1:8787/v1/counts"
    )
    expect(() => countsEndpoint("http://example.com")).toThrow()
    expect(() => countsEndpoint("https://example.com/other")).toThrow()
  })

  it("accepts only HTTPS or loopback previous snapshot URLs", () => {
    expect(
      previousSnapshotEndpoint("https://paseo.cafe/api/install-counts").href
    ).toBe("https://paseo.cafe/api/install-counts")
    expect(() =>
      previousSnapshotEndpoint("http://example.com/snapshot")
    ).toThrow()
  })

  it("fails instead of hiding an invalid endpoint override", async () => {
    const paths = fixture()
    await expect(
      fetchAndWriteInstallCounts({
        ...paths,
        serviceUrl: "http://catalog.example",
        previousSnapshotUrl: "https://paseo.cafe/api/install-counts",
      })
    ).rejects.toThrow(/HTTPS/)

    await expect(
      fetchAndWriteInstallCounts({
        ...paths,
        serviceUrl: "https://api.paseo.cafe",
        previousSnapshotUrl: "http://catalog.example/snapshot",
      })
    ).rejects.toThrow(/HTTPS/)
  })

  it("replaces a malformed existing snapshot with unavailable state", () => {
    const paths = fixture()
    writeFileSync(paths.outputPath, "{not-json")
    const snapshot = ensureExistingInstallCounts({
      ...paths,
      observedAt: "2026-09-11T01:00:00.000Z",
    })

    expect(snapshot).toEqual({
      schemaVersion: 1,
      status: "unavailable",
      attemptedAt: "2026-09-11T01:00:00.000Z",
      fetchedAt: null,
      data: null,
    })
    expect(JSON.parse(readFileSync(paths.outputPath, "utf8"))).toEqual(snapshot)
  })

  it("writes a successful aggregate without changing zero counts", async () => {
    const paths = fixture()
    const snapshot = await fetchAndWriteInstallCounts({
      ...paths,
      serviceUrl: "https://api.paseo.cafe",
      now: () => new Date("2026-09-10T01:00:00.000Z"),
      fetcher: (async () => Response.json(responseBody)) as typeof fetch,
    })

    expect(snapshot).toMatchObject({
      status: "available",
      data: responseBody,
    })
    expect(JSON.parse(readFileSync(paths.outputPath, "utf8"))).toEqual(snapshot)
  })

  it("labels a successfully fetched prior-day publication as stale", async () => {
    const paths = fixture()
    const snapshot = await fetchAndWriteInstallCounts({
      ...paths,
      serviceUrl: "https://api.paseo.cafe",
      now: () => new Date("2026-09-11T01:00:00.000Z"),
      fetcher: (async () => Response.json(responseBody)) as typeof fetch,
    })

    expect(snapshot).toMatchObject({
      status: "stale",
      fetchedAt: "2026-09-11T01:00:00.000Z",
      data: responseBody,
    })
  })

  it("marks a retained success stale and never turns failure into zero", async () => {
    const paths = fixture()
    writeFileSync(
      paths.outputPath,
      JSON.stringify({
        schemaVersion: 1,
        status: "available",
        attemptedAt: "2026-09-10T01:00:00.000Z",
        fetchedAt: "2026-09-10T01:00:00.000Z",
        data: responseBody,
      })
    )

    const snapshot = await fetchAndWriteInstallCounts({
      ...paths,
      serviceUrl: "https://api.paseo.cafe",
      now: () => new Date("2026-09-11T01:00:00.000Z"),
      fetcher: (async () => {
        throw new Error("offline")
      }) as typeof fetch,
    })

    expect(snapshot.status).toBe("stale")
    expect(snapshot.data?.counts).toEqual(responseBody.counts)
  })

  it("restores the deployed snapshot when the service is unavailable", async () => {
    const paths = fixture()
    const deployed = {
      schemaVersion: 1,
      status: "available",
      attemptedAt: "2026-09-10T01:00:00.000Z",
      fetchedAt: "2026-09-10T01:00:00.000Z",
      data: responseBody,
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("down", { status: 503 }))
      .mockResolvedValueOnce(Response.json(deployed))

    const snapshot = await fetchAndWriteInstallCounts({
      ...paths,
      serviceUrl: "https://api.paseo.cafe",
      previousSnapshotUrl: "https://paseo.cafe/api/install-counts",
      now: () => new Date("2026-09-11T01:00:00.000Z"),
      fetcher,
    })

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "https://api.paseo.cafe/v1/counts",
      "https://paseo.cafe/api/install-counts",
    ])
    expect(snapshot).toMatchObject({
      status: "stale",
      fetchedAt: deployed.fetchedAt,
      data: responseBody,
    })
  })

  it("writes explicit unavailable state when no valid success exists", async () => {
    const paths = fixture()
    const snapshot = await fetchAndWriteInstallCounts({
      ...paths,
      serviceUrl: "https://api.paseo.cafe",
      now: () => new Date("2026-09-11T01:00:00.000Z"),
      fetcher: (async () =>
        new Response("down", { status: 503 })) as typeof fetch,
    })

    expect(snapshot).toEqual({
      schemaVersion: 1,
      status: "unavailable",
      attemptedAt: "2026-09-11T01:00:00.000Z",
      fetchedAt: null,
      data: null,
    })
  })
})
