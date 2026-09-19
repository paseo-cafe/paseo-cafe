import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import { Pressable, Text, View } from "react-native"
import type { DirectoryEntry } from "../shared/directory"
import {
  formatDirectoryCompactCount,
  getDirectoryPopularityMetric,
} from "../shared/directory"
import { CAFE_CONTROL_RADIUS, CAFE_MONO_FONT } from "./visual"

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
        minWidth: 260,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: 8,
        gap: 10,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View
        accessible={false}
        style={{
          height: compact ? 150 : 170,
          flexDirection: "row",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: preview.colors.border,
          backgroundColor: preview.colors.background,
        }}
      >
        <View
          style={{
            width: "28%",
            padding: 12,
            gap: 9,
            borderRightWidth: 1,
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
        <View style={{ flex: 1, padding: 14, gap: 12 }}>
          <View
            style={{
              width: "84%",
              gap: 8,
              padding: 12,
              borderWidth: 1,
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
              padding: 10,
              borderWidth: 1,
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
          gap: 8,
        }}
      >
        <View style={{ minWidth: 0, flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.foreground,
              fontFamily: CAFE_MONO_FONT,
              fontSize: 14,
              fontWeight: "600",
            }}
          >
            {preview.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{
                flexShrink: 1,
                color: theme.colors.foregroundMuted,
                fontFamily: CAFE_MONO_FONT,
                fontSize: 11,
              }}
            >
              {entry.name}
            </Text>
            {popularity ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
              >
                <Icon
                  name={popularity.source === "npm" ? "Download" : "Star"}
                  size={10}
                  color={theme.colors.foregroundMuted}
                />
                <Text
                  style={{
                    color: theme.colors.foregroundMuted,
                    fontFamily: CAFE_MONO_FONT,
                    fontSize: 10,
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
            color: theme.colors.foregroundMuted,
            fontFamily: CAFE_MONO_FONT,
            fontSize: 10,
            textTransform: "uppercase",
          }}
        >
          {preview.appearance}
        </Text>
      </View>
    </Pressable>
  )
}
