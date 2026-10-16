import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import { Text, View } from "react-native"
import { mutedTextColor, space } from "./visual"

interface InstallCountProps {
  /** From `getPluginRowInstalls`. */
  installs: { text: string; accessibilityLabel: string }
  theme: PluginTheme
  /** Surface the count sits on, so the muted colour keeps its contrast. */
  background: string
}

/** Download icon and compact install count, the same on rows and theme tiles. */
export function InstallCount({
  installs,
  theme,
  background,
}: InstallCountProps) {
  const color = mutedTextColor(theme, background)
  return (
    <View
      accessible
      accessibilityLabel={installs.accessibilityLabel}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        flexShrink: 0,
      }}
    >
      <Icon name="Download" size={13} color={color} />
      <Text numberOfLines={1} style={{ color, fontSize: 12, lineHeight: 16 }}>
        {installs.text}
      </Text>
    </View>
  )
}
