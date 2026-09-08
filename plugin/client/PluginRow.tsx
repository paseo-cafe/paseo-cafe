import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import { useMemo } from "react"
import { Image, Pressable, Text, View } from "react-native"
import type { DirectoryEntry } from "../shared/directory"

interface PluginRowProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  onPress: () => void
}

// Deliberately no per-row Install button: with the whole card opening the
// detail page (see onPress below), a nested button here fights the card's
// own press target. Install lives on the detail page instead.
export function PluginRow({ entry, theme, compact, onPress }: PluginRowProps) {
  const styles = useMemo(
    () => ({
      row: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
        padding: compact ? 12 : 16,
        gap: 8,
        backgroundColor: theme.colors.surface1,
      },
      headerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
      },
      starsRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        marginLeft: "auto" as const,
      },
      avatar: { width: 20, height: 20, borderRadius: 10 },
      name: {
        color: theme.colors.foreground,
        fontSize: 16,
        fontWeight: "600" as const,
        flexShrink: 1,
      },
      meta: { color: theme.colors.foregroundMuted, fontSize: 12 },
      description: { color: theme.colors.foregroundMuted, fontSize: 13 },
      tagsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
      },
      tag: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface2,
      },
      tagText: { color: theme.colors.foregroundMuted, fontSize: 11 },
      requirementTag: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.accent,
      },
      requirementTagText: {
        color: theme.colors.accentForeground,
        fontSize: 11,
        fontWeight: "600" as const,
      },
    }),
    [theme, compact]
  )

  const tags = [...entry.categories, ...entry.platforms]
  const hasTagsRow = tags.length > 0 || !!entry.paseoVersionRequirement

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${entry.name}`}
      style={styles.row}
      onPress={onPress}
    >
      <View style={styles.headerRow}>
        {entry.owner?.avatarUrl ? (
          <Image
            accessible={false}
            source={{ uri: entry.owner.avatarUrl }}
            style={styles.avatar}
          />
        ) : null}
        <Text style={styles.name}>{entry.name}</Text>
        {entry.repoMeta?.stars !== undefined ? (
          <View style={styles.starsRow}>
            <Icon name="Star" size={12} color={theme.colors.foregroundMuted} />
            <Text style={styles.meta}>{entry.repoMeta.stars}</Text>
          </View>
        ) : null}
      </View>
      {entry.description ? (
        <Text style={styles.description} numberOfLines={2}>
          {entry.description}
        </Text>
      ) : null}
      {hasTagsRow ? (
        <View style={styles.tagsRow}>
          {entry.paseoVersionRequirement ? (
            <View style={styles.requirementTag}>
              <Text style={styles.requirementTagText}>
                Paseo {entry.paseoVersionRequirement}
              </Text>
            </View>
          ) : null}
          {tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}
