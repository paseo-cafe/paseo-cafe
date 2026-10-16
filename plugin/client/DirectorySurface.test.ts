import { describe, expect, it, vi } from "vitest"

vi.mock("@getpaseo/plugin/client", () => ({
  useRpc: () => undefined,
  useSettings: () => undefined,
}))
vi.mock("@getpaseo/plugin/client/react-native", () => ({
  FlatList: () => null,
  Modal: Object.assign(() => null, { Content: () => null }),
  ScrollView: () => null,
  TextInput: () => null,
  useToast: () => ({ error: () => undefined, show: () => undefined }),
}))
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  Pressable: () => null,
  Text: () => null,
  useWindowDimensions: () => ({ width: 1024, height: 768 }),
  View: () => null,
}))
vi.mock("./PluginDetailPage", () => ({ PluginDetailPage: () => null }))
vi.mock("./PluginGalleryPage", () => ({ PluginGalleryPage: () => null }))
vi.mock("./PluginRow", () => ({ PluginRow: () => null }))
vi.mock("./Skeleton", () => ({
  RowSkeleton: () => null,
  ThemeGridSkeleton: () => null,
}))
vi.mock("./StateMessage", () => ({ StateMessage: () => null }))
vi.mock("./ThemeCard", () => ({ ThemeCard: () => null }))
vi.mock("./web", () => ({ openExternal: async () => undefined }))

import { canQueueAutomaticUpdatePreference } from "./DirectorySurface"

describe("automatic update preference availability", () => {
  it("rejects writes while settings are invalid or unavailable", () => {
    expect(canQueueAutomaticUpdatePreference("error")).toBe(false)
    expect(canQueueAutomaticUpdatePreference("invalid")).toBe(false)
    expect(canQueueAutomaticUpdatePreference("loading")).toBe(true)
    expect(canQueueAutomaticUpdatePreference("ready")).toBe(true)
  })
})
