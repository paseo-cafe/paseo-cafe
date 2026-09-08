import type { PluginTheme } from "@getpaseo/plugin"
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native"
import { useMemo } from "react"
import { Pressable, Text, View } from "react-native"
import type { DirectoryEntry } from "../shared/directory"
import { AspectImage } from "./AspectImage"

interface PluginGalleryPageProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  onBack: () => void
}

/** Full-width screenshots page — the space a Modal can never give (see ImageLightbox's own note on that ceiling). */
export function PluginGalleryPage({
  entry,
  theme,
  compact,
  onBack,
}: PluginGalleryPageProps) {
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: { padding: compact ? 16 : 24, gap: 16, maxWidth: 1100 },
      backRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        marginBottom: 4,
      },
      backText: { color: theme.colors.accent, fontSize: 14 },
      title: {
        color: theme.colors.foreground,
        fontSize: compact ? 20 : 24,
        fontWeight: "700" as const,
      },
      images: { gap: 20 },
    }),
    [theme, compact]
  )

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Back to ${entry.name}`}
          style={styles.backRow}
          onPress={onBack}
        >
          <Icon name="ArrowLeft" size={16} color={theme.colors.accent} />
          <Text style={styles.backText}>{entry.name}</Text>
        </Pressable>
        <Text style={styles.title}>Screenshots</Text>
        <View style={styles.images}>
          {entry.images.map((image) => (
            <AspectImage
              key={image}
              uri={image}
              backgroundColor={theme.colors.surface2}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
