import { describe, expect, it } from "vitest"
import { readDirectoryUrl } from "./index.server"

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
