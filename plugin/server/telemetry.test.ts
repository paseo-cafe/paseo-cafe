import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { describe, expect, it, onTestFinished, vi } from "vitest"
import {
  createInstallReportManager,
  type InstallReport,
  resolveInstallReportUrl,
  sendInstallReport,
} from "./telemetry"

const NONCE = "11111111-1111-4111-8111-111111111111"

describe("install report consent", () => {
  it("consumes an opted-out completion without sending", async () => {
    const sent: InstallReport[] = []
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
    const sent: InstallReport[] = []
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
    const sent: InstallReport[] = []
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
    expect(sent).toEqual([{ pluginId: "review", nonce: NONCE }])
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

    reports.cancelAll()
    expect(aborted).toBe(true)
    reports.dispose()
  })
})

describe("install report sender", () => {
  it("does not forward reports through HTTP redirects", async () => {
    const redirectedRequests: string[] = []
    const server = createServer((request, response) => {
      if (request.url === "/v1/install") {
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
      sendInstallReport(
        { pluginId: "review", nonce: NONCE },
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

    await sendInstallReport(
      { pluginId: "review", nonce: NONCE },
      {
        serviceUrl: "http://127.0.0.1:8787",
        retryDelaysMs: [0],
        fetch: fetchMock as typeof globalThis.fetch,
      }
    )

    expect(requests).toEqual([
      {
        url: "http://127.0.0.1:8787/v1/install",
        body: { pluginId: "review", nonce: NONCE },
      },
      {
        url: "http://127.0.0.1:8787/v1/install",
        body: { pluginId: "review", nonce: NONCE },
      },
    ])
  })

  it("allows only HTTPS or loopback HTTP service overrides", () => {
    expect(resolveInstallReportUrl("https://cafe.example")).toBe(
      "https://cafe.example/v1/install"
    )
    expect(resolveInstallReportUrl("http://localhost:8787")).toBe(
      "http://localhost:8787/v1/install"
    )
    expect(() => resolveInstallReportUrl("http://cafe.example")).toThrow(
      "must use HTTPS"
    )
  })
})
