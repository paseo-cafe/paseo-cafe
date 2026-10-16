import type { PluginTheme } from "@getpaseo/plugin"
import { useEffect, useMemo, useState } from "react"
import { AccessibilityInfo, Animated, View } from "react-native"
import { MIN_TOUCH, radius, space } from "./visual"

const PULSE_MS = 700
const PULSE_LOW = 0.5

/**
 * Opacity that pulses while the list loads. Holds still until the system's
 * reduce-motion setting has resolved, and for good when it is on.
 */
function usePulse() {
  const [opacity] = useState(() => new Animated.Value(1))
  const [reduceMotion, setReduceMotion] = useState<boolean | undefined>()

  useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (!cancelled) setReduceMotion(enabled)
      },
      () => {
        if (!cancelled) setReduceMotion(true)
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (reduceMotion !== false) return
    // The native driver is off so the same code runs on web.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: PULSE_LOW,
          duration: PULSE_MS,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: PULSE_MS,
          useNativeDriver: false,
        }),
      ])
    )
    loop.start()
    return () => {
      loop.stop()
      opacity.setValue(1)
    }
  }, [reduceMotion, opacity])

  return opacity
}

/** A placeholder bar centered in a box as tall as the text line it stands in for. */
function Bar({
  theme,
  width,
  height,
  lineHeight,
}: {
  theme: PluginTheme
  width: `${number}%`
  height: number
  lineHeight: number
}) {
  return (
    <View style={{ height: lineHeight, justifyContent: "center" }}>
      <View
        style={{
          width,
          height,
          borderRadius: radius.sm,
          backgroundColor: theme.colors.surface2,
        }}
      />
    </View>
  )
}

/** The `count` placeholders a list shows while it loads, sized like `PluginRow`. */
export function RowSkeleton({
  theme,
  count = 8,
  compact = false,
}: {
  theme: PluginTheme
  count?: number
  compact?: boolean
}) {
  const opacity = usePulse()
  const styles = useMemo(
    () => ({
      list: { gap: space.sm },
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.md,
        minHeight: compact ? MIN_TOUCH : undefined,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        padding: space.md,
        backgroundColor: theme.colors.surface1,
      },
      icon: {
        width: compact ? 44 : 40,
        height: compact ? 44 : 40,
        borderRadius: radius.md,
        backgroundColor: theme.colors.surface2,
      },
      body: { flex: 1, minWidth: 0, gap: 2 },
    }),
    [theme, compact]
  )
  const slots = Array.from({ length: count }, (_, index) => index)

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.list, { opacity }]}
    >
      {slots.map((slot) => (
        <View key={slot} style={styles.row}>
          <View style={styles.icon} />
          <View style={styles.body}>
            <Bar theme={theme} width="40%" height={12} lineHeight={20} />
            <Bar theme={theme} width="85%" height={10} lineHeight={16} />
            <Bar theme={theme} width="30%" height={10} lineHeight={16} />
          </View>
        </View>
      ))}
    </Animated.View>
  )
}

/** Placeholders for a grid of `ThemeCard`s: a 4:3 tile over a name and an author line. */
export function ThemeGridSkeleton({
  theme,
  columns,
  count = columns * 3,
}: {
  theme: PluginTheme
  columns: number
  count?: number
}) {
  const opacity = usePulse()
  const styles = useMemo(
    () => ({
      grid: { gap: space.md },
      gridRow: { flexDirection: "row" as const, gap: space.md },
      cell: { flex: 1, minWidth: 0 },
      card: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.lg,
        overflow: "hidden" as const,
        backgroundColor: theme.colors.surface1,
      },
      tile: { aspectRatio: 4 / 3, backgroundColor: theme.colors.surface2 },
      text: { padding: space.sm },
    }),
    [theme]
  )
  const perRow = Math.max(1, Math.floor(columns))
  const rows = Array.from({ length: Math.ceil(count / perRow) }, (_, row) =>
    Array.from({ length: perRow }, (_, column) => row * perRow + column)
  )

  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[styles.grid, { opacity }]}
    >
      {rows.map((cells) => (
        <View key={cells.join("-")} style={styles.gridRow}>
          {cells.map((cell) => (
            <View key={cell} style={styles.cell}>
              {cell < count ? (
                <View style={styles.card}>
                  <View style={styles.tile} />
                  <View style={styles.text}>
                    <Bar
                      theme={theme}
                      width="60%"
                      height={12}
                      lineHeight={20}
                    />
                    <Bar
                      theme={theme}
                      width="40%"
                      height={10}
                      lineHeight={16}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ))}
    </Animated.View>
  )
}
