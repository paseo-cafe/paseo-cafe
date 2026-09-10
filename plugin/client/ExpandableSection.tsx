import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { expandableAccessibilityLabel } from "./accessibility"
import { CAFE_CONTROL_RADIUS, CAFE_MONO_FONT } from "./visual"

interface ExpandableSectionProps {
  title: string
  subtitle?: string
  theme: PluginTheme
  children: ReactNode
  initiallyExpanded?: boolean
}

/** Native counterpart to the website's collapsed-by-default ExpandableSection. */
export function ExpandableSection({
  title,
  subtitle,
  theme,
  children,
  initiallyExpanded = false,
}: ExpandableSectionProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const styles = useMemo(
    () => ({
      container: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        backgroundColor: theme.colors.surface1,
      },
      summary: {
        minHeight: 44,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      },
      titleRow: {
        minWidth: 0,
        flex: 1,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      title: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        fontWeight: "600" as const,
      },
      subtitle: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
      },
      body: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        padding: 12,
      },
    }),
    [theme]
  )

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expandableAccessibilityLabel(
          expanded,
          title,
          subtitle
        )}
        accessibilityState={{ expanded }}
        style={styles.summary}
        onPress={() => setExpanded((current) => !current)}
      >
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Icon
          name={expanded ? "ChevronUp" : "ChevronDown"}
          size={15}
          color={theme.colors.foregroundMuted}
        />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  )
}
