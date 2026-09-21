import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { BORDER_WIDTH, ICON, SPACE } from "../shared/design-tokens"
import { expandableAccessibilityLabel } from "./accessibility"
import { panelStyle, typeStyle } from "./visual"

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
      container: panelStyle(theme),
      summary: {
        minHeight: 44, // Minimum touch target.
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: SPACE.stack,
        padding: SPACE.stack,
      },
      titleRow: {
        minWidth: 0,
        flex: 1,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.group,
      },
      title: {
        ...typeStyle("label"),
        color: theme.colors.foreground,
      },
      subtitle: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
      },
      body: {
        borderTopWidth: BORDER_WIDTH,
        borderTopColor: theme.colors.border,
        padding: SPACE.stack,
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
          size={ICON.md}
          color={theme.colors.foregroundMuted}
        />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  )
}
