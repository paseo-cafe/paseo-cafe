import type { PluginTheme } from "@getpaseo/plugin"
import { useMemo } from "react"
import { Pressable, Text, View } from "react-native"
import {
  formatCatalogCompactCount,
  formatCatalogDateForReader,
} from "../shared/catalog"
import type {
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import { countAvailableUpdates } from "../shared/directory"
import { InstallCount } from "./InstallCount"
import { PluginIcon } from "./PluginIcon"
import { StatusPill } from "./StatusPill"
import { MIN_TOUCH, mutedTextColor, radius, space } from "./visual"

/**
 * Which date, if any, the list is ordered by: "updated" follows the
 * recently-updated sort, "added" the recently-added sort. Rows show a date
 * only when the list is ordered by it, so the figure explains the order.
 */
export type PluginRowDateBadge = "updated" | "added"

export interface PluginRowProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  /** Installations of this entry only. */
  installations: readonly InstalledPlugin[]
  /** Update check results keyed by installation id. */
  updates: ReadonlyMap<string, PluginUpdate>
  dateBadge?: PluginRowDateBadge
  onPress: () => void
}

export interface PluginRowStatus {
  text: string
  /** "update" when at least one installation has an update waiting. */
  tone: "update" | "installed"
}

/**
 * The installed or update badge for one entry, or undefined when it is not
 * installed. An available update outranks the plain installed state; the other
 * update outcomes (current, newer, local, error, unknown) all read as "installed"
 * here and are spelled out per installation on the detail page.
 */
export function getPluginRowStatus(
  installations: readonly InstalledPlugin[],
  updates: ReadonlyMap<string, PluginUpdate>
): PluginRowStatus | undefined {
  if (installations.length === 0) return undefined
  const available = countAvailableUpdates(
    installations.flatMap((installation) => updates.get(installation.id) ?? [])
  )
  if (available > 0) {
    return {
      text:
        available === 1 ? "Update available" : `${available} updates available`,
      tone: "update",
    }
  }
  return {
    text:
      installations.length === 1
        ? "Installed"
        : `${installations.length} installations`,
    tone: "installed",
  }
}

/** The registry's install count for one entry; undefined when the registry reports none. */
export function getPluginRowInstalls(
  entry: Pick<DirectoryEntry, "installs">
): { text: string; accessibilityLabel: string } | undefined {
  const { installs } = entry
  if (installs === undefined) return undefined
  const noun = installs === 1 ? "install" : "installs"
  return {
    text: `${formatCatalogCompactCount(installs)} ${noun}`,
    accessibilityLabel: `${installs} ${noun}`,
  }
}

/** "Updated Sep 11, 2026" or "Added Sep 11, 2026" for the sort in effect; undefined when there is no usable date. */
export function getPluginRowDateBadge(
  entry: Pick<DirectoryEntry, "updatedAt" | "publishedAt">,
  dateBadge: PluginRowDateBadge | undefined
): string | undefined {
  if (dateBadge === undefined) return undefined
  const label = dateBadge === "updated" ? "Updated" : "Added"
  const formatted = formatCatalogDateForReader(
    dateBadge === "updated" ? entry.updatedAt : entry.publishedAt
  )
  return formatted && `${label} ${formatted}`
}

/** The GitHub handle of the author, falling back to their display name. */
export function getAuthorLabel(
  author: DirectoryEntry["author"]
): string | undefined {
  return author.github.trim() || author.name?.trim() || undefined
}

/** Category display names in entry order; an unknown slug is shown as is. */
export function getCategoryNames(
  entry: Pick<DirectoryEntry, "categories">,
  categoryLabels: ReadonlyMap<string, string>
): string[] {
  return entry.categories.map((slug) => categoryLabels.get(slug) ?? slug)
}

/**
 * The row's muted text meta, "by acme · Updated Sep 11, 2026"; undefined when
 * the entry has neither. The install count is rendered beside it with an icon.
 */
export function getPluginRowMeta(
  entry: Pick<DirectoryEntry, "author" | "updatedAt" | "publishedAt">,
  dateBadge: PluginRowDateBadge | undefined
): string | undefined {
  const author = getAuthorLabel(entry.author)
  const parts = [
    author ? `by ${author}` : undefined,
    getPluginRowDateBadge(entry, dateBadge),
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(" · ") : undefined
}

/**
 * One entry in the companion's directory list: icon tile, name, one-line
 * description and meta, and a filled status pill when installed.
 *
 * Deliberately no per-row Install button: installing goes through the detail
 * page, where the pinned artifact is reviewed first.
 */
export function PluginRow({
  entry,
  theme,
  compact,
  installations,
  updates,
  dateBadge,
  onPress,
}: PluginRowProps) {
  const styles = useMemo(
    () => ({
      row: (pressed: boolean) => ({
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.md,
        minHeight: compact ? MIN_TOUCH : undefined,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        padding: space.md,
        backgroundColor: theme.colors.surface1,
        opacity: pressed ? 0.8 : 1,
      }),
      body: { flex: 1, minWidth: 0, gap: 2 },
      name: {
        color: theme.colors.foreground,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "600" as const,
      },
      description: {
        color: mutedTextColor(theme, theme.colors.surface1),
        fontSize: 12,
        lineHeight: 16,
      },
      descriptionEmpty: {
        color: mutedTextColor(theme, theme.colors.surface1),
        fontSize: 12,
        lineHeight: 16,
        fontStyle: "italic" as const,
      },
      meta: {
        color: mutedTextColor(theme, theme.colors.surface1),
        fontSize: 12,
        lineHeight: 16,
        flexShrink: 1,
      },
      metaRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.sm,
      },
    }),
    [theme, compact]
  )

  const status = getPluginRowStatus(installations, updates)
  const installs = getPluginRowInstalls(entry)
  const meta = getPluginRowMeta(entry, dateBadge)
  const description = entry.description.trim()

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View details for ${entry.name}${status ? `, ${status.text}` : ""}${installs ? `, ${installs.accessibilityLabel}` : ""}`}
      style={({ pressed }) => styles.row(pressed)}
      onPress={onPress}
    >
      <PluginIcon entry={entry} theme={theme} size={compact ? 44 : 40} />
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.name}>
          {entry.name}
        </Text>
        <Text
          numberOfLines={1}
          style={description ? styles.description : styles.descriptionEmpty}
        >
          {description || "No description provided."}
        </Text>
        {meta || installs ? (
          <View style={styles.metaRow}>
            {meta ? (
              <Text numberOfLines={1} style={styles.meta}>
                {meta}
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
        ) : null}
      </View>
      {status ? (
        <StatusPill text={status.text} tone={status.tone} theme={theme} />
      ) : null}
    </Pressable>
  )
}
