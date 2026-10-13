import type { PluginTheme } from "@getpaseo/plugin"
import { useMemo } from "react"
import { Pressable, Text, View } from "react-native"
import { MIN_TOUCH, mutedTextColor, radius, space } from "./visual"

interface StateMessageProps {
  theme: PluginTheme
  title: string
  body?: string
  actionLabel?: string
  onAction?: () => void
  tone?: "neutral" | "error"
  compact?: boolean
}

/** A centered empty or error state with an optional single action. */
export function StateMessage({
  theme,
  title,
  body,
  actionLabel,
  onAction,
  tone = "neutral",
  compact = false,
}: StateMessageProps) {
  const styles = useMemo(
    () => ({
      block: {
        alignItems: "center" as const,
        gap: space.sm,
        paddingVertical: space.xl,
        paddingHorizontal: space.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        // The error tone is carried by the border so the text keeps its own contrast.
        borderColor:
          tone === "error" ? theme.colors.statusDanger : theme.colors.border,
        backgroundColor: theme.colors.surface1,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "600" as const,
        textAlign: "center" as const,
      },
      body: {
        color: mutedTextColor(theme, theme.colors.surface1),
        fontSize: 12,
        lineHeight: 18,
        textAlign: "center" as const,
      },
      action: (pressed: boolean) => ({
        alignItems: "center" as const,
        justifyContent: "center" as const,
        marginTop: space.xs,
        minHeight: compact ? MIN_TOUCH : 32,
        paddingHorizontal: space.lg,
        borderRadius: radius.md,
        backgroundColor: theme.colors.accent,
        opacity: pressed ? 0.85 : 1,
      }),
      actionText: {
        color: theme.colors.accentForeground,
        fontSize: 14,
        fontWeight: "600" as const,
      },
    }),
    [theme, tone, compact]
  )

  return (
    <View role={tone === "error" ? "alert" : undefined} style={styles.block}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={({ pressed }) => styles.action(pressed)}
          onPress={onAction}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
