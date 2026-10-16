import type { PluginServerContext } from "@getpaseo/plugin/server"
import { describe, expect, it, vi } from "vitest"
import contribute from "./index.server"
import type { runAutomaticPluginUpdates } from "./server/directory"

import {
  DEFAULT_REGISTRY_URL,
  directoryRunAutomaticUpdatesRpc,
  directorySearchRpc,
} from "./shared/directory"

function fakeServer(
  read: () => Promise<unknown>,
  handlers = new Map<string, (input: unknown) => unknown>()
) {
  return {
    handlers,
    server: {
      registerSettings: () => ({ read }),
      handle: (
        contract: { name: string },
        handler: (input: unknown) => unknown
      ) => {
        handlers.set(contract.name, handler)
      },
    } as unknown as PluginServerContext,
  }
}

const READY = {
  status: "ready" as const,
  revision: "1",
  values: {
    registryUrl: "https://registry.example.test",
    autoUpdateOptOuts: [],
    browse: {},
  },
}

describe("registry settings", () => {
  const registry = () =>
    Response.json({
      schemaVersion: 1,
      registry: { name: "Test" },
      categories: [],
      featured: [],
      plugins: [],
    })

  it("searches the registry configured in settings", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => registry())
    vi.stubGlobal("fetch", fetcher)
    vi.useFakeTimers()
    try {
      const { server, handlers } = fakeServer(async () => READY)
      const cleanup = contribute(server)

      await handlers.get(directorySearchRpc.name)?.({ query: "" })

      expect(fetcher.mock.calls[0]?.[0]).toBe(
        "https://registry.example.test/index.json"
      )
      cleanup()
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it("falls back to the official registry when settings are invalid or unreadable", async () => {
    // The registry cache is per base URL, so the second read is a cache hit:
    // what matters is that neither failure mode throws or picks another URL.
    const fetcher = vi.fn<typeof fetch>(async () => registry())
    vi.stubGlobal("fetch", fetcher)
    vi.useFakeTimers()
    try {
      for (const read of [
        async () => ({ status: "invalid" }),
        async () => {
          throw new Error("storage unavailable")
        },
      ]) {
        const { server, handlers } = fakeServer(read)
        const cleanup = contribute(server)
        await expect(
          handlers.get(directorySearchRpc.name)?.({ query: "" })
        ).resolves.toEqual({ items: [] })
        cleanup()
      }
      expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
        `${DEFAULT_REGISTRY_URL}/index.json`,
      ])
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})

describe("automatic update lifecycle", () => {
  it("registers the manual RPC and clears scheduled checks on cleanup", () => {
    vi.useFakeTimers()
    try {
      const handlers = new Map<string, (input: unknown) => unknown>()
      const cleanup = contribute({
        registerSettings: () => ({
          read: async () => ({
            status: "ready" as const,
            revision: "1",
            values: {
              registryUrl: "https://registry.example.test",
              autoUpdateOptOuts: [],
              browse: {},
            },
          }),
        }),
        handle: (
          contract: { name: string },
          handler: (input: unknown) => unknown
        ) => {
          handlers.set(contract.name, handler)
        },
      } as unknown as PluginServerContext)

      expect(handlers.has(directoryRunAutomaticUpdatesRpc.name)).toBe(true)
      expect(vi.getTimerCount()).toBe(2)
      cleanup()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("aborts an automatic update after its startup timer fires", async () => {
    vi.useFakeTimers()
    try {
      let signal: AbortSignal | undefined
      let markStarted: () => void = () => {}
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      const run = vi.fn(
        async (
          _readSettings: unknown,
          _dependencies: unknown,
          currentSignal?: AbortSignal
        ) => {
          signal = currentSignal
          markStarted()
          await new Promise<void>((resolve) => {
            currentSignal?.addEventListener("abort", () => resolve(), {
              once: true,
            })
          })
          return []
        }
      )
      const cleanup = contribute(
        {
          registerSettings: () => ({
            read: async () => ({
              status: "ready" as const,
              revision: "1",
              values: {
                registryUrl: "https://registry.example.test",
                autoUpdateOptOuts: [],
                browse: {},
              },
            }),
          }),
          handle: () => {},
        } as unknown as PluginServerContext,
        { run: run as unknown as typeof runAutomaticPluginUpdates }
      )

      await vi.advanceTimersByTimeAsync(30_000)
      await started
      cleanup()
      expect(signal?.aborted).toBe(true)
      await expect(run.mock.results[0]?.value).resolves.toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
