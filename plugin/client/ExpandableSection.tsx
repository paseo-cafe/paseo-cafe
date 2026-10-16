import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import type { ReactNode } from "react"
import { useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import { expandableAccessibilityLabel } from "./accessibility"
import { MIN_TOUCH, mutedTextColor, radius, space } from "./visual"

interface ExpandableSectionProps {
  title: string
  subtitle?: string
  theme: PluginTheme
  children: ReactNode
  initiallyExpanded?: boolean
}

/** Collapsed-by-default disclosure section. */
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
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface1,
      },
      summary: {
        minHeight: MIN_TOUCH,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: space.md,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
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
        fontSize: 14,
        fontWeight: "600" as const,
      },
      subtitle: {
        color: mutedTextColor(theme, theme.colors.surface1),
        fontSize: 12,
      },
      body: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        padding: space.md,
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
        aria-expanded={expanded}
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
