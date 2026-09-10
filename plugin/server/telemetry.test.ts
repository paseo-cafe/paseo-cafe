import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import {
  createInstallReportManager,
  type InstallReportManager,
  type LifecycleEventReport,
  resolveInstallReportUrl,
  sendLifecycleEvent,
} from "./telemetry"

const NONCE = "11111111-1111-4111-8111-111111111111"

describe("install report consent", () => {
  it("consumes an opted-out completion without sending", async () => {
    const sent: LifecycleEventReport[] = []
    const reports = createInstallReportManager({
      nonce: () => NONCE,
      send: async (report) => {
        sent.push(report)
      },
    })
    const reportToken = reports.begin("review")
    reports.confirm(reportToken, true)

    expect(reports.complete(reportToken, false)).toBe(false)
    expect(reports.complete(reportToken, true)).toBe(false)
    await Promise.resolve()
    expect(sent).toEqual([])
    reports.dispose()
  })

  it("does not send when post-install inventory cannot confirm the source", async () => {
    const sent: LifecycleEventReport[] = []
    const reports = createInstallReportManager({
      nonce: () => NONCE,
      send: async (report) => {
        sent.push(report)
      },
    })
    const reportToken = reports.begin("review")
    reports.complete(reportToken, true)
    reports.confirm(reportToken, false)

    await Promise.resolve()
    expect(sent).toEqual([])
    reports.dispose()
  })

  it("sends a confirmed completion once across duplicate clients", async () => {
    const sent: LifecycleEventReport[] = []
    const reports = createInstallReportManager({
      nonce: () => NONCE,
      send: async (report) => {
        sent.push(report)
      },
    })
    const reportToken = reports.begin("review")

    expect(reports.complete(reportToken, true)).toBe(true)
    expect(reports.complete(reportToken, true)).toBe(false)
    reports.confirm(reportToken, true)
    await Promise.resolve()
    expect(sent).toEqual([
      { pluginId: "review", event: "install", nonce: NONCE },
    ])
    reports.dispose()
  })

  it("aborts an outstanding send when consent is revoked", async () => {
    let aborted = false
    const reports = createInstallReportManager({
      nonce: () => NONCE,
      send: async (_report, { signal }) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true
          },
          { once: true }
        )
      },
    })
    const reportToken = reports.begin("review")
    reports.confirm(reportToken, true)
    reports.complete(reportToken, true)

    reports.setEnabled(false)
    expect(aborted).toBe(true)
    reports.dispose()
  })

  it("sends update and uninstall events through the same bounded sender", async () => {
    const sent: LifecycleEventReport[] = []
    const nonces = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]
    const reports = createInstallReportManager({
      nonce: () => nonces.shift() ?? NONCE,
      send: async (report) => {
        sent.push(report)
      },
    })

    await expect(
      reports.report([
        { pluginId: "review", event: "update" },
        { pluginId: "review", event: "uninstall" },
      ])
    ).resolves.toBe(2)
    expect(sent).toEqual([
      {
        pluginId: "review",
        event: "update",
        nonce: "11111111-1111-4111-8111-111111111111",
      },
      {
        pluginId: "review",
        event: "uninstall",
        nonce: "22222222-2222-4222-8222-222222222222",
      },
    ])
    reports.dispose()
  })

  it("stops the remaining lifecycle batch after cancellation", async () => {
    const attempted: LifecycleEventReport[] = []
    let reports: InstallReportManager
    reports = createInstallReportManager({
      nonce: () => NONCE,
      send: async (report) => {
        attempted.push(report)
        reports.setEnabled(false)
        throw new Error("aborted")
      },
    })

    await expect(
      reports.report([
        { pluginId: "review", event: "update" },
        { pluginId: "review", event: "uninstall" },
      ])
    ).resolves.toBe(0)
    expect(attempted).toHaveLength(1)
    reports.dispose()
  })

  it("rejects stale batches until explicitly re-enabled", async () => {
    const sent: LifecycleEventReport[] = []
    const reports = createInstallReportManager({
      nonce: () => NONCE,
      send: async (report) => {
        sent.push(report)
      },
    })

    reports.setEnabled(false)
    await expect(
      reports.report([{ pluginId: "review", event: "update" }])
    ).resolves.toBe(0)
    reports.setEnabled(true)
    await expect(
      reports.report([{ pluginId: "review", event: "update" }])
    ).resolves.toBe(1)
    expect(sent).toHaveLength(1)
    reports.dispose()
  })
})

describe("install report sender", () => {
  it("does not forward reports through HTTP redirects", async () => {
    const redirectedRequests: string[] = []
    const server = createServer((request, response) => {
      if (request.url === "/v1/events") {
        response.writeHead(307, { location: "/unexpected-destination" }).end()
      } else {
        redirectedRequests.push(request.url ?? "")
        response.writeHead(204).end()
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    onTestFinished(async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    })
    const { port } = server.address() as AddressInfo
    await expect(
      sendLifecycleEvent(
        { pluginId: "review", event: "install", nonce: NONCE },
        { serviceUrl: `http://127.0.0.1:${port}`, retryDelaysMs: [] }
      )
    ).rejects.toThrow()
    expect(redirectedRequests).toEqual([])
  })

  it("reuses one nonce across bounded retries and sends no extra fields", async () => {
    const requests: Array<{ url: string; body: unknown }> = []
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        })
        return new Response(null, { status: 503 })
      })
      .mockImplementationOnce(async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        })
        return new Response(null, { status: 204 })
      })

    await sendLifecycleEvent(
      { pluginId: "review", event: "install", nonce: NONCE },
      {
        serviceUrl: "http://127.0.0.1:8787",
        retryDelaysMs: [0],
        fetch: fetchMock as typeof globalThis.fetch,
      }
    )

    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:8787/v1/events",
        body: { pluginId: "review", event: "install", nonce: NONCE },
      },
      {
        url: "http://127.0.0.1:8787/v1/events",
        body: { pluginId: "review", event: "install", nonce: NONCE },
      },
    ])
  })

  it("allows only HTTPS or loopback HTTP service overrides", () => {
    expect(resolveInstallReportUrl("https://cafe.example")).toBe(
      "https://cafe.example/v1/events"
    )
    expect(resolveInstallReportUrl("http://localhost:8787")).toBe(
      "http://localhost:8787/v1/events"
    )
    expect(() => resolveInstallReportUrl("http://cafe.example")).toThrow(
      "must use HTTPS"
    )
  })
})
