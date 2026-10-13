import type { PluginClientContext } from "@getpaseo/plugin/client"
import { describe, expect, it, vi } from "vitest"

vi.mock("./DirectorySurface", () => ({ DirectorySurface: () => null }))
vi.mock("./SidebarItem", () => ({
  DIRECTORY_SCREEN_ID: "directory",
  DirectorySidebarItem: () => null,
}))

import { registerDirectory } from "./register"

function fakeClient() {
  const client = {
    addScreen: vi.fn(),
    addSidebarHeaderItem: vi.fn(),
    addCommandCenterItem: vi.fn(),
  }
  return {
    client: client as unknown as PluginClientContext,
    ...client,
  }
}

describe("registerDirectory", () => {
  it("registers the directory screen and a sidebar header item that can carry the badge", () => {
    const { client, addScreen, addSidebarHeaderItem } = fakeClient()
    registerDirectory(client)
    expect(addScreen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "directory", title: "Paseo Cafe" })
    )
    expect(addSidebarHeaderItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: "directory", title: "Paseo Cafe" })
    )
  })

  it("opens the directory screen from the command center", () => {
    const { client, addCommandCenterItem } = fakeClient()
    registerDirectory(client)
    const [{ title, onSelect }] = addCommandCenterItem.mock.calls[0] as [
      { title: string; onSelect(context: unknown): void },
    ]
    const openScreen = vi.fn()
    onSelect({ openScreen })
    expect(title).toBe("Browse Paseo Cafe")
    expect(openScreen).toHaveBeenCalledWith({ screenId: "directory" })
  })
})
