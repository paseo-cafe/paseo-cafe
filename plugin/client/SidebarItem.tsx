import type { PluginSidebarItemProps } from "@getpaseo/plugin/client"
import { useRpc, useSettings } from "@getpaseo/plugin/client"
import { SidebarRow } from "@getpaseo/plugin/client/ui"
import { useQuery } from "@tanstack/react-query"
import { Text, View } from "react-native"
import type { InstalledPlugin } from "../shared/directory"
import {
  directorySettings,
  directoryUpdateStatusRpc,
} from "../shared/directory"
import { countAvailableUpdates, updateStatusQueryKey } from "./update-status"
import { CAFE_CONTROL_RADIUS, CAFE_MONO_FONT } from "./visual"

export const DIRECTORY_SCREEN_ID = "directory"

// The check runs `paseo plugin ls` and a git fetch per tracked branch on the
// daemon, and this item mounts on every app launch, so look less often than
// the surface does.
const SIDEBAR_STALE_MS = 5 * 60_000

function UpdateBadge({
  count,
  theme,
}: {
  count: number
  theme: PluginSidebarItemProps["theme"]
}) {
  return (
    <View
      style={{
        minWidth: 20,
        paddingHorizontal: 6,
        paddingVertical: 1,
        alignItems: "center",
        backgroundColor: theme.colors.accent,
        borderRadius: CAFE_CONTROL_RADIUS,
      }}
    >
      <Text
        accessibilityLabel={`${count} plugin ${count === 1 ? "update" : "updates"} available`}
        style={{
          color: theme.colors.accentForeground,
          fontFamily: CAFE_MONO_FONT,
          fontSize: 11,
          fontWeight: "600",
        }}
      >
        {count > 99 ? "99+" : count}
      </Text>
    </View>
  )
}

export function DirectorySidebarItem({
  theme,
  currentScreen,
  openScreen,
}: PluginSidebarItemProps) {
  const listUpdateStatus = useRpc(directoryUpdateStatusRpc)
  const settings = useSettings(directorySettings)
  const baseUrl =
    settings.status === "ready" ? settings.values.directoryUrl : undefined
  const previewOptIns =
    settings.status === "ready" ? settings.values.previewOptIns : []
  const { data } = useQuery<{ installations: readonly InstalledPlugin[] }>({
    queryKey: updateStatusQueryKey(baseUrl, previewOptIns),
    queryFn: async () =>
      (await listUpdateStatus({ baseUrl, previewOptIns })) as {
        installations: readonly InstalledPlugin[]
      },
    // Same gate as the surface: never fetch the default catalog and then
    // replace it with the configured one.
    enabled: settings.status !== "loading",
    staleTime: SIDEBAR_STALE_MS,
  })
  const count = data ? countAvailableUpdates(data.installations) : 0
  return (
    <SidebarRow
      icon="Coffee"
      active={currentScreen?.screenId === DIRECTORY_SCREEN_ID}
      onPress={() => openScreen({ screenId: DIRECTORY_SCREEN_ID })}
      trailing={count > 0 ? <UpdateBadge count={count} theme={theme} /> : null}
    />
  )
}
