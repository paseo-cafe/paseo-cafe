import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import { useMemo } from "react"
import { Image, Pressable, Text, View } from "react-native"
import type { DirectoryEntry, InstalledPlugin } from "../shared/directory"
import {
  DIRECTORY_CATEGORY_LABELS,
  DIRECTORY_PLATFORM_LABELS,
  formatDirectoryVersion,
  getDirectoryDateBadge,
  HEALTH_KEYS,
  normalizeDirectoryCategory,
} from "../shared/directory"
import { CAFE_CONTROL_RADIUS, CAFE_MONO_FONT } from "./visual"

interface PluginRowProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  installations: readonly InstalledPlugin[]
  /**
   * Whether to show when the catalog listed this plugin. The row always shows
   * when the source repository was last updated, so that date needs no flag;
   * this one appears when the list is ordered by it, so the order can be read
   * off the rows.
   */
  showAddedDate?: boolean
  onPress: () => void
}

type BadgeColor = "muted" | "success" | "warning" | "danger" | "accent"

interface BadgeTone {
  text: string
  color: BadgeColor
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000) {
    const scaled = value / 1_000_000
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}M`.replace(
      ".0M",
      "M"
    )
  }
  if (value >= 1_000) {
    const scaled = value / 1_000
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}k`.replace(
      ".0k",
      "k"
    )
  }
  return `${value}`
}

export function getHealthBadge(entry: DirectoryEntry): BadgeTone | null {
  if (entry.scanError) {
    return { text: "Scan issue", color: "danger" }
  }
  if (!entry.health) return null

  const values = HEALTH_KEYS.map((key) => entry.health?.[key])
  const failed = values.filter((value) => value === false).length
  if (failed > 0) {
    return {
      text: `Health ${failed} warning${failed === 1 ? "" : "s"}`,
      color: "warning",
    }
  }
  if (values.some((value) => value === undefined)) {
    return { text: "Health incomplete", color: "muted" }
  }
  return { text: "Health OK", color: "success" }
}

// Deliberately no per-row Install button: with the whole card opening the
// detail page (see onPress below), a nested button here fights the card's
// own press target. Install lives on the detail page instead.
export function PluginRow({
  entry,
  theme,
  compact,
  installations,
  showAddedDate,
  onPress,
}: PluginRowProps) {
  const styles = useMemo(
    () => ({
      row: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: compact ? 12 : 14,
        gap: 8,
        backgroundColor: theme.colors.surface1,
      },
      headerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        flexWrap: "wrap" as const,
      },
      avatar: { width: 20, height: 20, borderRadius: 10 },
      name: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 16,
        fontWeight: "600" as const,
        letterSpacing: -0.2,
        flexShrink: 1,
      },
      statusBadge: {
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface2,
      },
      statusText: (updateAvailable: boolean) => ({
        color: updateAvailable
          ? theme.colors.statusWarning
          : theme.colors.statusSuccess,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
      }),
      metaRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
        alignItems: "center" as const,
      },
      metaBadge: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface2,
      },
      metaBadgeText: (tone: BadgeColor) => ({
        color:
          tone === "success"
            ? theme.colors.statusSuccess
            : tone === "warning"
              ? theme.colors.statusWarning
              : tone === "danger"
                ? theme.colors.statusDanger
                : tone === "accent"
                  ? theme.colors.accent
                  : theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
      }),
      description: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        lineHeight: 19,
      },
      tagsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
      },
      tag: {
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface2,
      },
      tagText: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
      },
    }),
    [theme, compact]
  )

  const tags = [
    ...entry.categories.map(
      (category) =>
        DIRECTORY_CATEGORY_LABELS[normalizeDirectoryCategory(category)]
    ),
    ...entry.platforms.map(
      (platform) =>
        DIRECTORY_PLATFORM_LABELS[
          platform as keyof typeof DIRECTORY_PLATFORM_LABELS
        ] ?? platform
    ),
  ]
  const hasTagsRow = tags.length > 0

  const updateCount = installations.filter(
    (installation) => installation.updateState === "available"
  ).length
  const statusLabel =
    updateCount > 0
      ? updateCount === 1
        ? "Update available"
        : `${updateCount} updates available`
      : installations.length > 0
        ? installations.length === 1
          ? "Installed"
          : `${installations.length} installations`
        : undefined

  const starCount = entry.repoMeta?.stars
  const updatedBadge = getDirectoryDateBadge(entry, "updated")
  const addedBadge = showAddedDate
    ? getDirectoryDateBadge(entry, "added")
    : undefined
  const healthBadge = getHealthBadge(entry)
  const versionLabel = formatDirectoryVersion(entry.version)
  const compatibilityLabel = entry.paseoVersionRequirement
    ? `Paseo ${entry.paseoVersionRequirement}`
    : "Paseo any"
  const caveatLabel =
    entry.caveats.length > 0
      ? entry.caveats.length === 1
        ? "1 caveat"
        : `${entry.caveats.length} caveats`
      : undefined

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${entry.name}${statusLabel ? `, ${statusLabel}` : ""}`}
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
        {statusLabel ? (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText(updateCount > 0)}>
              {statusLabel}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.metaRow}>
        {versionLabel ? (
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText("accent")}>{versionLabel}</Text>
          </View>
        ) : null}
        {starCount !== undefined ? (
          <View style={styles.metaBadge}>
            <Icon name="Star" size={11} color={theme.colors.foregroundMuted} />
            <Text style={styles.metaBadgeText("muted")}>
              {formatCompactNumber(starCount)}
            </Text>
          </View>
        ) : null}
        {addedBadge ? (
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText("muted")}>{addedBadge}</Text>
          </View>
        ) : null}
        {updatedBadge ? (
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText("muted")}>{updatedBadge}</Text>
          </View>
        ) : null}
        <View style={styles.metaBadge}>
          <Text style={styles.metaBadgeText("accent")}>
            {compatibilityLabel}
          </Text>
        </View>
        {caveatLabel ? (
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText("warning")}>{caveatLabel}</Text>
          </View>
        ) : null}
        {healthBadge ? (
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText(healthBadge.color)}>
              {healthBadge.text}
            </Text>
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
