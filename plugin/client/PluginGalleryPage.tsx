import type { PluginTheme } from "@getpaseo/plugin"
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native"
import { useMemo } from "react"
import { Platform, Pressable, Text, View } from "react-native"
import type { DirectoryEntry } from "../shared/directory"
import { AspectImage } from "./AspectImage"
import { isVideoMediaUrl } from "./media"
import { MIN_TOUCH, mutedTextColor, radius, space } from "./visual"
import { openExternal } from "./web"

interface PluginGalleryPageProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  onBack: () => void
}

/** Full-width media page: the space a Modal can never give (see AspectImage's own note on that ceiling). */
export function PluginGalleryPage({
  entry,
  theme,
  compact,
  onBack,
}: PluginGalleryPageProps) {
  const styles = useMemo(() => {
    // Compact layouts and native hosts are touch layouts: controls reach the minimum target.
    const touch =
      compact || Platform.OS !== "web" ? { minHeight: MIN_TOUCH } : null
    return {
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        width: "100%" as const,
        maxWidth: 1100,
        alignSelf: "center" as const,
        padding: compact ? space.lg : space.xl,
        gap: space.lg,
      },
      backRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        alignSelf: "flex-start" as const,
        gap: space.xs,
        marginBottom: space.xs,
        minHeight: MIN_TOUCH,
      },
      backText: {
        color: theme.colors.foreground,
        fontSize: 14,
        textDecorationLine: "underline" as const,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: compact ? 20 : 24,
        fontWeight: "700" as const,
      },
      items: { gap: 20 },
      fullSize: { gap: space.xs },
      fullSizeLink: {
        ...touch,
        alignSelf: "flex-start" as const,
        justifyContent: "center" as const,
      },
      fullSizeText: {
        color: theme.colors.foreground,
        fontSize: 12,
        textDecorationLine: "underline" as const,
      },
      videoRow: {
        ...touch,
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        padding: space.md,
        backgroundColor: theme.colors.surface1,
      },
      videoText: {
        flexShrink: 1,
        color: theme.colors.foreground,
        fontSize: 14,
        textDecorationLine: "underline" as const,
      },
    }
  }, [theme, compact])

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${entry.name}`}
          style={styles.backRow}
          onPress={onBack}
        >
          <Icon name="ArrowLeft" size={16} color={theme.colors.foreground} />
          <Text style={styles.backText}>{entry.name}</Text>
        </Pressable>
        <Text role="heading" aria-level={1} style={styles.title}>
          Gallery
        </Text>
        <View style={styles.items}>
          {entry.media.map((url, index) =>
            isVideoMediaUrl(url) ? (
              <Pressable
                key={url}
                accessibilityRole="link"
                accessibilityLabel={`Open video for ${entry.name}`}
                style={styles.videoRow}
                onPress={() => openExternal(url)}
              >
                <Icon
                  name="ExternalLink"
                  size={16}
                  color={theme.colors.foreground}
                />
                <Text style={styles.videoText}>Open video</Text>
              </Pressable>
            ) : (
              <View key={url} style={styles.fullSize}>
                <AspectImage
                  uri={url}
                  maxHeight={compact ? 480 : 640}
                  label={`${entry.name} screenshot ${index + 1} of ${entry.media.length}`}
                  backgroundColor={theme.colors.surface2}
                  borderRadius={radius.lg}
                  fallbackTextColor={mutedTextColor(
                    theme,
                    theme.colors.surface2
                  )}
                />
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open screenshot ${index + 1} of ${entry.name} at full size`}
                  style={styles.fullSizeLink}
                  onPress={() => openExternal(url)}
                >
                  <Text style={styles.fullSizeText}>Open full size</Text>
                </Pressable>
              </View>
            )
          )}
        </View>
      </ScrollView>
    </View>
  )
}
