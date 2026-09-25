import type { PluginServerContext } from "@getpaseo/plugin/server"
import { describe, expect, it, vi } from "vitest"
import contribute, { readDirectoryUrl } from "./index.server"
import { directoryRunAutomaticUpdatesRpc } from "./shared/directory"

describe("server catalog settings", () => {
  it("uses a ready catalog URL", async () => {
    await expect(
      readDirectoryUrl({
        read: async () => ({
          status: "ready",
          values: { directoryUrl: "https://catalog.example/plugins" },
        }),
      })
    ).resolves.toBe("https://catalog.example/plugins")
  })

  it("falls back when settings are invalid or unreadable", async () => {
    await expect(
      readDirectoryUrl({ read: async () => ({ status: "invalid" }) })
    ).resolves.toBeUndefined()
    await expect(
      readDirectoryUrl({
        read: async () => {
          throw new Error("storage unavailable")
        },
      })
    ).resolves.toBeUndefined()
    await expect(readDirectoryUrl(undefined)).resolves.toBeUndefined()
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
              directoryUrl: "https://catalog.example/plugins",
              previewOptIns: [],
              autoUpdateOptIns: [],
              browse: {},
              pendingSelfUpdate: null,
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
})
