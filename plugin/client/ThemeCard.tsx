import type { PluginTheme } from "@getpaseo/plugin"
import { useMemo, useState } from "react"
import { Image, Pressable, Text, View } from "react-native"
import type {
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import { InstallCount } from "./InstallCount"
import { firstImageMedia } from "./media"
import { PluginIcon } from "./PluginIcon"
import {
  getAuthorLabel,
  getPluginRowInstalls,
  getPluginRowStatus,
} from "./PluginRow"
import { StatusPill } from "./StatusPill"
import { mutedTextColor, radius, space } from "./visual"

export interface ThemeCardProps {
  entry: DirectoryEntry
  theme: PluginTheme
  /** Outer width of the card in px; the screenshot tile is 4:3 within it. */
  width: number
  /** Installations of this entry only. */
  installations: readonly InstalledPlugin[]
  /** Update check results keyed by installation id. */
  updates: ReadonlyMap<string, PluginUpdate>
  onPress: () => void
}

/** Largest fallback icon on a card without a screenshot. */
const MAX_FALLBACK_ICON = 64

/**
 * One theme in the browse grid: its first screenshot cropped to a 4:3 tile
 * (the plugin's icon or initial when it has none), then name and author. The
 * registry carries no theme colours, so the screenshot is the only preview.
 */
export function ThemeCard({
  entry,
  theme,
  width,
  installations,
  updates,
  onPress,
}: ThemeCardProps) {
  const [failedCover, setFailedCover] = useState<string | undefined>()
  const styles = useMemo(
    () => ({
      card: (pressed: boolean) => ({
        width,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.lg,
        overflow: "hidden" as const,
        backgroundColor: theme.colors.surface1,
        opacity: pressed ? 0.8 : 1,
      }),
      tile: {
        width: "100%" as const,
        aspectRatio: 4 / 3,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: theme.colors.surface2,
      },
      cover: { width: "100%" as const, height: "100%" as const },
      pill: {
        position: "absolute" as const,
        top: space.sm,
        left: space.sm,
      },
      text: { padding: space.sm },
      name: {
        color: theme.colors.foreground,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "600" as const,
      },
      author: {
        color: mutedTextColor(theme, theme.colors.surface1),
        fontSize: 12,
        lineHeight: 16,
      },
    }),
    [theme, width]
  )

  const cover = firstImageMedia(entry.media)
  const showCover = cover !== undefined && cover !== failedCover
  const status = getPluginRowStatus(installations, updates)
  const author = getAuthorLabel(entry.author)
  const installs = getPluginRowInstalls(entry)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${entry.name}${status ? `, ${status.text}` : ""}${installs ? `, ${installs.accessibilityLabel}` : ""}`}
      style={({ pressed }) => styles.card(pressed)}
      onPress={onPress}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.tile}
      >
        {showCover ? (
          <Image
            accessible={false}
            resizeMode="cover"
            source={{ uri: cover }}
            style={styles.cover}
            onError={() => setFailedCover(cover)}
          />
        ) : (
          <PluginIcon
            entry={entry}
            theme={theme}
            size={Math.min(MAX_FALLBACK_ICON, Math.round(width * 0.3))}
          />
        )}
        {status ? (
          <View style={styles.pill}>
            <StatusPill text={status.text} tone={status.tone} theme={theme} />
          </View>
        ) : null}
      </View>
      <View style={styles.text}>
        <Text numberOfLines={1} style={styles.name}>
          {entry.name}
        </Text>
        {author ? (
          <Text numberOfLines={1} style={styles.author}>
            {`by ${author}`}
          </Text>
        ) : null}
        {installs ? (
          <InstallCount
            installs={installs}
            theme={theme}
            background={theme.colors.surface1}
          />
        ) : null}
      </View>
    </Pressable>
  )
}
