import { describe, expect, it, vi } from "vitest"
import type { DirectoryEntry } from "../shared/directory"
import { directoryEntrySchema } from "../shared/directory"
import { getHealthBadge } from "./PluginRow"

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  Icon: () => null,
}))
vi.mock("react-native", () => ({
  Image: () => null,
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}))

function entryWithHealth(health: DirectoryEntry["health"]): DirectoryEntry {
  return directoryEntrySchema.parse({
    id: "health-test",
    repo: "owner/repo",
    url: "https://github.com/owner/repo",
    name: "Health Test",
    health,
  })
}

describe("plugin row health badge", () => {
  it("counts only explicit failures and renders unknown checks as incomplete", () => {
    expect(getHealthBadge(entryWithHealth({ manifestValid: false }))).toEqual({
      text: "Health 1 warning",
      color: "warning",
    })
    expect(getHealthBadge(entryWithHealth({ manifestValid: true }))).toEqual({
      text: "Health incomplete",
      color: "muted",
    })
    expect(getHealthBadge(entryWithHealth({}))).toEqual({
      text: "Health incomplete",
      color: "muted",
    })
  })
})
