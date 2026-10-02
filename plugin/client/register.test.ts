import type { PluginClientContext } from "@getpaseo/plugin/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("./DirectorySurface", () => ({ DirectorySurface: () => null }))
vi.mock("./SidebarItem", () => ({
  DIRECTORY_SCREEN_ID: "directory",
  DirectorySidebarItem: () => null,
}))

import { registerDirectory } from "./register"

function fakeClient(withSidebarHeaderItem: boolean) {
  const calls: string[] = []
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(name)
      return args
    }
  const client = {
    addScreen: record("addScreen"),
    addSurface: record("addSurface"),
    addSidebarItem: record("addSidebarItem"),
    addCommandCenterItem: vi.fn(),
    ...(withSidebarHeaderItem
      ? { addSidebarHeaderItem: record("addSidebarHeaderItem") }
      : {}),
  }
  return { client: client as unknown as PluginClientContext, calls }
}

describe("registerDirectory", () => {
  it("uses a sidebar header item, which can carry the badge, when the app has it", () => {
    const { client, calls } = fakeClient(true)
    registerDirectory(client)
    expect(calls).toEqual(["addScreen", "addSidebarHeaderItem"])
  })

  it("keeps the legacy surface and sidebar item on apps without sidebar header items", () => {
    const { client, calls } = fakeClient(false)
    registerDirectory(client)
    expect(calls).toEqual(["addSurface", "addSidebarItem"])
  })

  it("opens the directory with whichever navigation the app provides", () => {
    const { client } = fakeClient(true)
    registerDirectory(client)
    const [{ onSelect }] = vi.mocked(client.addCommandCenterItem).mock
      .calls[0] as [{ onSelect(context: unknown): void }]
    const openScreen = vi.fn()
    const openSurface = vi.fn()
    onSelect({ openScreen, openSurface })
    expect(openScreen).toHaveBeenCalledWith({ screenId: "directory" })
    expect(openSurface).not.toHaveBeenCalled()
    onSelect({ openSurface })
    expect(openSurface).toHaveBeenCalledWith("directory")
  })
})
