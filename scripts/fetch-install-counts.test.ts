import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, onTestFinished } from "vitest"
import {
  countsEndpoint,
  fetchAndWriteInstallCounts,
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
