import type { PluginTheme } from "@getpaseo/plugin"
import { useMemo } from "react"
import { Text, View } from "react-native"
import { radius, space } from "./visual"

interface StatusPillProps {
  text: string
  tone: "update" | "installed"
  theme: PluginTheme
}

/** A filled badge for an installed plugin or one with an update waiting. */
export function StatusPill({ text, tone, theme }: StatusPillProps) {
  const styles = useMemo(
    () => ({
      pill: {
        flexShrink: 0,
        borderRadius: radius.sm,
        paddingHorizontal: space.sm - 2,
        paddingVertical: 2,
        backgroundColor:
          tone === "update"
            ? theme.colors.statusWarning
            : theme.colors.statusSuccess,
      },
      text: {
        color: theme.colors.surface0,
        fontSize: 11,
        lineHeight: 16,
        fontWeight: "600" as const,
      },
    }),
    [theme, tone]
  )

  return (
    <View style={styles.pill}>
      <Text numberOfLines={1} style={styles.text}>
        {text}
      </Text>
    </View>
  )
}
