import { describe, expect, it, vi } from "vitest"

vi.mock("@getpaseo/plugin/client", () => ({
  useRpc: () => undefined,
  useSettings: () => undefined,
}))
vi.mock("@getpaseo/plugin/client/react-native", () => ({
  FlatList: () => null,
  Icon: () => null,
  Modal: Object.assign(() => null, { Content: () => null }),
  ScrollView: () => null,
  TextInput: () => null,
  copyText: async () => undefined,
  useToast: () => ({ error: () => undefined, show: () => undefined }),
}))
vi.mock("react-native", () => ({
  Image: () => null,
  Linking: { openURL: async () => undefined },
  Platform: { OS: "web" },
  Pressable: () => null,
  Text: () => null,
  View: () => null,
}))

import { canQueueAutomaticUpdatePreference } from "./DirectorySurface"

describe("automatic update preference availability", () => {
  it("rejects writes while settings are invalid or unavailable", () => {
    expect(canQueueAutomaticUpdatePreference("error")).toBe(false)
    expect(canQueueAutomaticUpdatePreference("invalid")).toBe(false)
    expect(canQueueAutomaticUpdatePreference("loading")).toBe(true)
    expect(canQueueAutomaticUpdatePreference("ready")).toBe(true)
  })
})
