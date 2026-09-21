import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import { Pressable, Text, View } from "react-native"
import { BORDER_WIDTH, ICON, SPACE } from "../shared/design-tokens"
import type { DirectoryEntry } from "../shared/directory"
import {
  formatDirectoryCompactCount,
  getDirectoryPopularityMetric,
} from "../shared/directory"
import { panelStyle, typeStyle } from "./visual"

interface ThemePreviewCardProps {
  entry: DirectoryEntry
  preview: DirectoryEntry["themes"][number]
  theme: PluginTheme
  compact: boolean
  showPopularity?: boolean
  onPress?: () => void
}

export function ThemePreviewCard({
  entry,
  preview,
  theme,
  compact,
  showPopularity = false,
  onPress,
}: ThemePreviewCardProps) {
  const accent = preview.colors.accent ?? preview.colors.foreground
  const popularity = showPopularity
    ? getDirectoryPopularityMetric(entry)
    : undefined
  const popularityLabel = popularity
    ? popularity.source === "npm"
      ? `${popularity.count} npm downloads in the last 30 days`
      : `${popularity.count} GitHub stars`
    : undefined

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      accessibilityLabel={`View ${preview.name} theme plugin details${popularityLabel ? `, ${popularityLabel}` : ""}`}
      onPress={onPress}
      style={{
        width: compact ? "100%" : "48.5%",
        minWidth: 260, // Narrowest a mock stays legible; below it the grid wraps.
        ...panelStyle(theme),
        padding: SPACE.group,
        gap: SPACE.stack,
      }}
    >
      {/* The mock's bar and swatch sizes are illustration geometry, not layout
          spacing; only its padding and gaps follow the shared scale. */}
      <View
        accessible={false}
        style={{
          height: compact ? 150 : 170,
          flexDirection: "row",
          overflow: "hidden",
          borderWidth: BORDER_WIDTH,
          borderColor: preview.colors.border,
          backgroundColor: preview.colors.background,
        }}
      >
        <View
          style={{
            width: "28%",
            padding: SPACE.stack,
            gap: SPACE.group,
            borderRightWidth: BORDER_WIDTH,
            borderColor: preview.colors.border,
            backgroundColor: preview.colors.raised,
          }}
        >
          <View style={{ width: 10, height: 10, backgroundColor: accent }} />
          {(["80%", "100%", "64%"] as const).map((width) => (
            <View
              key={width}
              style={{
                width,
                height: 4,
                backgroundColor: preview.colors.mutedForeground,
              }}
            />
          ))}
        </View>
        <View style={{ flex: 1, padding: SPACE.base, gap: SPACE.stack }}>
          <View
            style={{
              width: "84%",
              gap: SPACE.group,
              padding: SPACE.stack,
              borderWidth: BORDER_WIDTH,
              borderColor: preview.colors.border,
              backgroundColor: preview.colors.raised,
            }}
          >
            <View
              style={{ width: "42%", height: 5, backgroundColor: accent }}
            />
            <View
              style={{
                width: "100%",
                height: 4,
                backgroundColor: preview.colors.foreground,
              }}
            />
            <View
              style={{
                width: "72%",
                height: 4,
                backgroundColor: preview.colors.mutedForeground,
              }}
            />
          </View>
          <View
            style={{
              marginTop: "auto",
              padding: SPACE.group,
              borderWidth: BORDER_WIDTH,
              borderColor: preview.colors.ring,
              backgroundColor: preview.colors.control,
            }}
          >
            <View
              style={{
                width: "70%",
                height: 4,
                backgroundColor: preview.colors.mutedForeground,
              }}
            />
          </View>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACE.group,
        }}
      >
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              ...typeStyle("label"),
              color: theme.colors.foreground,
            }}
          >
            {preview.name}
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: SPACE.chip,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                ...typeStyle("meta"),
                flexShrink: 1,
                color: theme.colors.foregroundMuted,
              }}
            >
              {entry.name}
            </Text>
            {popularity ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACE.inline,
                }}
              >
                <Icon
                  name={popularity.source === "npm" ? "Download" : "Star"}
                  size={ICON.sm}
                  color={theme.colors.foregroundMuted}
                />
                <Text
                  style={{
                    ...typeStyle("meta"),
                    color: theme.colors.foregroundMuted,
                  }}
                >
                  {formatDirectoryCompactCount(popularity.count)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text
          style={{
            ...typeStyle("eyebrow"),
            color: theme.colors.foregroundMuted,
          }}
        >
          {preview.appearance}
        </Text>
      </View>
    </Pressable>
  )
}
