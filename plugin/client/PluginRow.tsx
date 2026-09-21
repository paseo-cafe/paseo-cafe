import type { PluginTheme } from "@getpaseo/plugin"
import { Icon } from "@getpaseo/plugin/client/react-native"
import { useMemo } from "react"
import { Image, Pressable, Text, View } from "react-native"
import { ICON, SPACE } from "../shared/design-tokens"
import type { DirectoryEntry, InstalledPlugin } from "../shared/directory"
import {
  DIRECTORY_CATEGORY_LABELS,
  DIRECTORY_PLATFORM_LABELS,
  directoryDescriptionNodes,
  formatDirectoryCompactCount,
  formatDirectoryDownloads,
  formatDirectoryVersion,
  getDirectoryAddedDateBadge,
  getDirectoryPopularityMetric,
  getDirectoryPublishedDateBadge,
  HEALTH_KEYS,
  hasCompleteDirectoryNpmMetrics,
  normalizeDirectoryCategory,
} from "../shared/directory"
import { InlineMarkdown } from "./InlineMarkdown"
import { chipStyle, panelStyle, typeStyle } from "./visual"

// Owner avatars are images, so their size is explicit rather than a token.
const AVATAR_SIZE = 20

interface PluginRowProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  installations: readonly InstalledPlugin[]
  /** Show when the catalog listed this plugin while ordered by that date. */
  showAddedDate?: boolean
  onPress: () => void
}

type BadgeColor = "muted" | "success" | "warning" | "danger" | "accent"

interface BadgeTone {
  text: string
  color: BadgeColor
}
export function getPluginRowPopularity(entry: DirectoryEntry):
  | {
      source: "npm" | "git"
      text: string
      accessibilityLabel: string
    }
  | undefined {
  const popularity = getDirectoryPopularityMetric(entry)
  if (!popularity) return undefined
  const text =
    popularity.source === "npm"
      ? formatDirectoryDownloads(popularity.count)
      : formatDirectoryCompactCount(popularity.count)
  return {
    source: popularity.source,
    text,
    accessibilityLabel:
      popularity.source === "npm" ? text : `${popularity.count} GitHub stars`,
  }
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
        ...panelStyle(theme),
        padding: compact ? SPACE.stack : SPACE.base,
        gap: SPACE.group,
      },
      headerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.group,
        flexWrap: "wrap" as const,
      },
      avatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
      },
      name: {
        ...typeStyle("label"),
        color: theme.colors.foreground,
        flexShrink: 1,
      },
      statusBadge: chipStyle(theme),
      statusText: (updateAvailable: boolean) => ({
        ...typeStyle("meta"),
        color: updateAvailable
          ? theme.colors.statusWarning
          : theme.colors.statusSuccess,
      }),
      metaRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.chip,
        alignItems: "center" as const,
      },
      metaBadge: {
        ...chipStyle(theme),
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.inline,
      },
      metaBadgeText: (tone: BadgeColor) => ({
        ...typeStyle("meta"),
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
      }),
      description: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
      },
      tagsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.chip,
      },
      tag: chipStyle(theme),
      tagText: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
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

  const popularity = getPluginRowPopularity(entry)
  const addedBadge = showAddedDate
    ? hasCompleteDirectoryNpmMetrics(entry)
      ? getDirectoryPublishedDateBadge(entry)
      : getDirectoryAddedDateBadge(entry)
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
  const descriptionNodes = directoryDescriptionNodes(entry)

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${entry.name}${statusLabel ? `, ${statusLabel}` : ""}${popularity ? `, ${popularity.accessibilityLabel}` : ""}`}
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
        {popularity ? (
          <View style={styles.metaBadge}>
            <Icon
              name={popularity.source === "npm" ? "Download" : "Star"}
              size={ICON.sm}
              color={theme.colors.foregroundMuted}
            />
            <Text style={styles.metaBadgeText("muted")}>{popularity.text}</Text>
          </View>
        ) : null}
        {addedBadge ? (
          <View style={styles.metaBadge}>
            <Text style={styles.metaBadgeText("muted")}>{addedBadge}</Text>
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
      {descriptionNodes.length > 0 ? (
        <InlineMarkdown
          nodes={descriptionNodes}
          theme={theme}
          style={styles.description}
          links="text"
          numberOfLines={2}
        />
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
