import type { PluginTheme } from "@getpaseo/plugin"
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native"
import { useMemo } from "react"
import { Pressable, Text, View } from "react-native"
import { getCatalogGalleryImages } from "../shared/catalog"
import { ICON, SPACE } from "../shared/design-tokens"
import type { DirectoryEntry } from "../shared/directory"
import { AspectImage } from "./AspectImage"
import { typeStyle } from "./visual"

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
  onBack,
}: PluginGalleryPageProps) {
  const images = getCatalogGalleryImages(entry.images, entry.owner)
  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        width: "100%" as const,
        maxWidth: 1100,
        alignSelf: "center" as const,
        padding: SPACE.base,
        gap: SPACE.base,
      },
      backRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.inline,
        marginBottom: SPACE.inline,
      },
      backText: {
        ...typeStyle("label"),
        color: theme.colors.accent,
      },
      title: {
        ...typeStyle("title"),
        color: theme.colors.foreground,
      },
      images: { gap: SPACE.base },
    }),
    [theme]
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
          <Icon name="ArrowLeft" size={ICON.md} color={theme.colors.accent} />
          <Text style={styles.backText}>{entry.name}</Text>
        </Pressable>
        <Text style={styles.title}>Screenshots</Text>
        <View style={styles.images}>
          {images.map((image) => (
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
