import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchRawJson, fetchRawText, MAX_GITHUB_RAW_BYTES } from "./github"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe("bounded GitHub raw files", () => {
  it("preserves normal text and JSON responses", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("hello"))
      .mockResolvedValueOnce(new Response('{"ok":true}')) as typeof fetch

    await expect(
      fetchRawText("owner", "repo", "main", "README.md")
    ).resolves.toBe("hello")
    await expect(
      fetchRawJson("owner", "repo", "main", "paseo-plugin.json")
    ).resolves.toEqual({ ok: true })
  })

  it("rejects an oversized declared JSON file before parsing", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response("{}", {
          headers: { "content-length": String(MAX_GITHUB_RAW_BYTES + 1) },
        })
    ) as typeof fetch
    const parse = vi.spyOn(JSON, "parse")

    await expect(
      fetchRawJson("owner", "repo", "main", "paseo-plugin.json")
    ).rejects.toThrow(
      `GitHub raw file exceeds ${MAX_GITHUB_RAW_BYTES} byte limit`
    )
    expect(parse).not.toHaveBeenCalled()
  })

  it("cancels an oversized streamed file", async () => {
    const chunk = new Uint8Array(64 * 1_024)
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk)
      },
      cancel() {
        cancelled = true
      },
    })
    globalThis.fetch = vi.fn(async () => new Response(stream)) as typeof fetch

    await expect(
      fetchRawText("owner", "repo", "main", "README.md")
    ).rejects.toThrow(
      `GitHub raw file exceeds ${MAX_GITHUB_RAW_BYTES} byte limit`
    )
    expect(cancelled).toBe(true)
  })
})
