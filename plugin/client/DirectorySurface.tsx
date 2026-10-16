import type { PluginTheme } from "@getpaseo/plugin"
import type { PluginSurfaceProps } from "@getpaseo/plugin/client"
import { useRpc, useSettings } from "@getpaseo/plugin/client"
import {
  FlatList,
  Modal,
  ScrollView,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/react-native"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react"
import { Pressable, Text, useWindowDimensions, View } from "react-native"
import type {
  DirectoryBrowseSettings,
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import {
  DEFAULT_DIRECTORY_BROWSE_SETTINGS,
  DEFAULT_REGISTRY_URL,
  directoryBrowseSettingsEqual,
  directoryInstallRpc,
  directoryListRpc,
  directorySettings,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
  isDefaultDirectoryBrowseView,
  SELF_INSTALLATION_ID,
  SUBMIT_URL,
  setAutomaticUpdatePreference,
} from "../shared/directory"
import { filterAccessibilityLabel } from "./accessibility"
import {
  categoryOptions as buildCategoryOptions,
  countByStatus,
  filterBySearchAndCategories,
  filterByStatus,
  type InstallationStatusFilter,
  indexInstallations,
  invalidListingsNotice,
  recountCategories,
  selectFeatured,
  splitThemes,
} from "./browse"
import { PluginDetailPage } from "./PluginDetailPage"
import { PluginGalleryPage } from "./PluginGalleryPage"
import { PluginRow, type PluginRowDateBadge } from "./PluginRow"
import { RowSkeleton, ThemeGridSkeleton } from "./Skeleton"
import { StateMessage } from "./StateMessage"
import { dateBadgeForSortMode, type SortMode, sortEntries } from "./sort"
import { ThemeCard } from "./ThemeCard"
import { UPDATE_STATUS_QUERY_KEY } from "./update-status"
import { MIN_TOUCH, mutedTextColor, radius, space } from "./visual"
import { openExternal } from "./web"

const DIRECTORY_QUERY_KEY = "paseo-cafe-directory"
const FEATURED_LIMIT = 6
const MAX_CONTENT_WIDTH = 1120
const THEME_GRID_GAP = space.md
/** Below this content width the desktop theme grid uses three columns, not four. */
const WIDE_THEME_BREAKPOINT = 1100
const SKELETON_ROWS = 8

const NO_CATEGORIES: ReadonlySet<string> = new Set()
const NO_PLUGINS: readonly DirectoryEntry[] = []
const NO_INSTALLATIONS: readonly InstalledPlugin[] = []

type Segment = "plugins" | "themes"

const SEGMENT_INFO: Record<Segment, { label: string; noun: string }> = {
  plugins: { label: "Plugins", noun: "plugin" },
  themes: { label: "Themes", noun: "theme" },
}
const SEGMENT_ORDER: readonly Segment[] = ["plugins", "themes"]

function countNoun(count: number, segment: Segment): string {
  const { noun } = SEGMENT_INFO[segment]
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

export function canQueueAutomaticUpdatePreference(status: string): boolean {
  return status !== "error" && status !== "invalid"
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

interface ChipProps {
  label: string
  role: "tab" | "radio" | "button"
  selected: boolean
  accessibilityLabel: string
  theme: PluginTheme
  largeTouchTarget: boolean
  disabled?: boolean
  /** Share the row evenly with sibling chips instead of hugging the label. */
  grow?: boolean
  size?: "md" | "lg"
  onPress: () => void
}

/** Segment, category and option control: accent fill when selected, surface2 otherwise. */
function Chip({
  label,
  role,
  selected,
  accessibilityLabel,
  theme,
  largeTouchTarget,
  disabled = false,
  grow = false,
  size = "md",
  onPress,
}: ChipProps) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={
        role === "radio"
          ? { checked: selected, disabled }
          : { selected, disabled }
      }
      aria-checked={role === "radio" ? selected : undefined}
      aria-selected={role === "tab" ? selected : undefined}
      aria-pressed={role === "button" ? selected : undefined}
      aria-disabled={disabled}
      disabled={disabled}
      style={{
        flex: grow ? 1 : undefined,
        flexShrink: 0,
        minHeight: largeTouchTarget ? MIN_TOUCH : size === "lg" ? 36 : 32,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.md,
        paddingHorizontal: space.md,
        paddingVertical: space.xs,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface2,
        opacity: disabled ? 0.5 : 1,
      }}
      onPress={onPress}
    >
      <Text
        numberOfLines={1}
        style={{
          color: selected
            ? theme.colors.accentForeground
            : mutedTextColor(theme, theme.colors.surface2),
          fontSize: size === "lg" ? 14 : 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** Shown after the label, e.g. a count. */
  detail?: string
  accessibilityLabel: string
  disabled?: boolean
}

function OptionGroup<T extends string>({
  label,
  accessibilityLabel,
  options,
  selected,
  theme,
  largeTouchTarget,
  onSelect,
}: {
  label: string
  accessibilityLabel: string
  options: readonly ChoiceOption<T>[]
  selected: T
  theme: PluginTheme
  largeTouchTarget: boolean
  onSelect: (value: T) => void
}) {
  return (
    <View style={{ gap: space.sm }}>
      <Text
        style={{
          color: mutedTextColor(theme),
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
      >
        {options.map((option) => (
          <Chip
            key={option.value}
            role="radio"
            label={
              option.detail === undefined
                ? option.label
                : `${option.label} ${option.detail}`
            }
            accessibilityLabel={option.accessibilityLabel}
            selected={selected === option.value}
            disabled={option.disabled}
            theme={theme}
            largeTouchTarget={largeTouchTarget}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
    </View>
  )
}

const STATUS_OPTIONS: readonly {
  value: InstallationStatusFilter
  label: string
}[] = [
  { value: "all", label: "All" },
  { value: "installed", label: "Installed" },
  { value: "updates", label: "Updates" },
  { value: "not-installed", label: "Not installed" },
]

interface UpdateVariables {
  entry: DirectoryEntry
  installation: InstalledPlugin
}

const SORT_OPTIONS: readonly { value: SortMode; label: string }[] = [
  { value: "updates-first", label: "Updates first" },
  { value: "popular", label: "Popular" },
  { value: "recent", label: "Recently updated" },
  { value: "recently-added", label: "Recently added" },
  { value: "a-z", label: "A to Z" },
]

export function DirectorySurface({ theme, layout }: PluginSurfaceProps) {
  const listDirectory = useRpc(directoryListRpc)
  const installPlugin = useRpc(directoryInstallRpc)
  const updatePlugin = useRpc(directoryUpdateRpc)
  const listUpdateStatus = useRpc(directoryUpdateStatusRpc)
  const settings = useSettings(directorySettings)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState(DEFAULT_DIRECTORY_BROWSE_SETTINGS.query)
  const [categoryFilter, setCategoryFilter] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [statusFilter, setStatusFilter] = useState<InstallationStatusFilter>(
    DEFAULT_DIRECTORY_BROWSE_SETTINGS.status
  )
  const [sortMode, setSortMode] = useState<SortMode>(
    DEFAULT_DIRECTORY_BROWSE_SETTINGS.sort
  )
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installFailure, setInstallFailure] = useState<{
    entryId: string
    message: string
  } | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [updateFailure, setUpdateFailure] = useState<{
    entryId: string
    message: string
  } | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [segment, setSegment] = useState<Segment>("plugins")
  const [screenWidth, setScreenWidth] = useState<number | null>(null)
  const windowSize = useWindowDimensions()
  const [galleryEntry, setGalleryEntry] = useState<DirectoryEntry | null>(null)
  const [lastOpenedPluginId, setLastOpenedPluginId] = useState<string | null>(
    DEFAULT_DIRECTORY_BROWSE_SETTINGS.lastOpenedPluginId
  )
  const [settingsHydrated, setSettingsHydrated] = useState(false)
  const hasHydratedSettings = useRef(false)
  const [pendingAutomaticPreference, setPendingAutomaticPreference] = useState<{
    installationId: string
    enabled: boolean
    attempts: number
  } | null>(null)

  const settingsValues = settings.status === "ready" ? settings.values : null
  const settingsRevision =
    settings.status === "ready" ? settings.revision : null
  const {
    saving: settingsSaving,
    save: saveSettings,
    reload: reloadSettings,
  } = settings
  const storedBrowse = settingsValues?.browse ?? null
  const browseSettings = useMemo<DirectoryBrowseSettings>(
    () => ({
      query: search,
      categories: Array.from(categoryFilter).sort(),
      status: statusFilter,
      sort: sortMode,
      lastOpenedPluginId,
    }),
    [search, categoryFilter, statusFilter, sortMode, lastOpenedPluginId]
  )

  useEffect(() => {
    if (hasHydratedSettings.current || storedBrowse === null) return

    hasHydratedSettings.current = true
    setSearch(storedBrowse.query)
    setCategoryFilter(new Set(storedBrowse.categories))
    setStatusFilter(storedBrowse.status)
    setSortMode(storedBrowse.sort)
    setLastOpenedPluginId(storedBrowse.lastOpenedPluginId)
    setSettingsHydrated(true)
  }, [storedBrowse])

  useEffect(() => {
    if (
      !settingsHydrated ||
      settingsValues === null ||
      settingsRevision === null ||
      storedBrowse === null ||
      settingsSaving ||
      directoryBrowseSettingsEqual(storedBrowse, browseSettings)
    ) {
      return
    }

    const timeout = setTimeout(() => {
      void saveSettings(
        { ...settingsValues, browse: browseSettings },
        settingsRevision
      )
        .then((saved) => {
          if (!saved) return reloadSettings()
        })
        .catch(() => undefined)
    }, 250)
    return () => clearTimeout(timeout)
  }, [
    browseSettings,
    reloadSettings,
    saveSettings,
    settingsHydrated,
    settingsRevision,
    settingsSaving,
    settingsValues,
    storedBrowse,
  ])

  useEffect(() => {
    if (
      !pendingAutomaticPreference ||
      !settingsValues ||
      settingsRevision === null ||
      settingsSaving
    ) {
      return
    }
    const pending = pendingAutomaticPreference
    void saveSettings(
      {
        ...settingsValues,
        autoUpdateOptOuts: setAutomaticUpdatePreference(
          settingsValues.autoUpdateOptOuts,
          pending.installationId,
          pending.enabled
        ),
      },
      settingsRevision
    ).then((saved) => {
      if (saved) {
        setPendingAutomaticPreference(null)
      } else if (pending.attempts < 1) {
        void reloadSettings().finally(() => {
          setPendingAutomaticPreference((current) =>
            current === pending
              ? { ...pending, attempts: pending.attempts + 1 }
              : current
          )
        })
      } else {
        setPendingAutomaticPreference(null)
        toast.error("Failed to save automatic update preference.")
      }
    })
  }, [
    pendingAutomaticPreference,
    reloadSettings,
    saveSettings,
    settingsRevision,
    settingsSaving,
    settingsValues,
    toast,
  ])

  const saveAutomaticUpdatePreference = (
    installationId: string,
    enabled: boolean
  ) => {
    if (!canQueueAutomaticUpdatePreference(settings.status)) {
      toast.error("Failed to save automatic update preference.")
      return
    }
    setPendingAutomaticPreference({ installationId, enabled, attempts: 0 })
    if (!settingsValues) void reloadSettings()
  }

  // The official registry until settings are readable, so an unreadable or
  // invalid settings document still shows a directory instead of a blank surface.
  const registryUrl = settingsValues?.registryUrl ?? DEFAULT_REGISTRY_URL
  const settingsPending = settings.status === "loading"
  const directoryQueryKey = [DIRECTORY_QUERY_KEY, registryUrl] as const

  const directoryQuery = useQuery({
    queryKey: directoryQueryKey,
    queryFn: () => listDirectory({ registryUrl, force: false }),
    // Only the first read is gated, so the official registry is never fetched
    // and then immediately replaced by the configured one.
    enabled: !settingsPending,
    staleTime: 60_000,
  })
  const directory = directoryQuery.data
  const inventoryAvailable = directory?.installations !== undefined
  const updateStatusQuery = useQuery({
    queryKey: UPDATE_STATUS_QUERY_KEY,
    queryFn: () => listUpdateStatus({ force: true }),
    enabled: inventoryAvailable,
    staleTime: 60_000,
  })

  const refreshInventory = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: directoryQueryKey,
        exact: true,
      }),
      queryClient.invalidateQueries({
        queryKey: UPDATE_STATUS_QUERY_KEY,
        exact: true,
      }),
    ])
  }

  const installMutation = useMutation({
    mutationFn: (entry: DirectoryEntry) =>
      installPlugin({
        registryUrl,
        id: entry.id,
        expected: entry.artifact,
      }),
    onMutate: (entry) => {
      setInstallingId(entry.id)
      setInstallFailure(null)
    },
    onSuccess: async (result, entry) => {
      if (!result.ok) {
        setInstallFailure({ entryId: entry.id, message: result.message })
        toast.error(`Couldn't install ${entry.name}. See details below.`)
        return
      }
      toast.show(`Installed ${entry.name}`, { variant: "success" })
      await refreshInventory()
    },
    onError: (error, entry) => {
      setInstallFailure({
        entryId: entry.id,
        message: errorMessage(error, "Install failed"),
      })
      toast.error(`Couldn't install ${entry.name}. See details below.`)
    },
    onSettled: () => setInstallingId(null),
  })

  const updateMutation = useMutation({
    mutationFn: ({ installation }: UpdateVariables) =>
      updatePlugin({ installationId: installation.id }),
    onMutate: ({ installation }) => {
      setUpdatingId(installation.id)
      setUpdateFailure(null)
    },
    onSuccess: async (result, { entry }) => {
      if (!result.ok) {
        setUpdateFailure({ entryId: entry.id, message: result.message })
        toast.error(`Couldn't update ${entry.name}. See details below.`)
        return
      }
      if (result.restarting) {
        // This plugin replaced itself: the process restarts, so the refetch
        // below may fail and retry until it is back. Not awaited for that reason.
        toast.show(result.message, { variant: "info" })
        void refreshInventory()
        return
      }
      toast.show(result.message, {
        variant: result.updated === false ? "info" : "success",
      })
      await refreshInventory()
    },
    onError: (error, { entry, installation }) => {
      if (installation.id === SELF_INSTALLATION_ID) {
        // The restart can drop the connection before the result arrives, so
        // the failure is unconfirmed rather than known.
        toast.show(
          `${entry.name} may be restarting. Reopen it in a moment to check the update.`,
          { variant: "info" }
        )
        void refreshInventory()
        return
      }
      setUpdateFailure({
        entryId: entry.id,
        message: errorMessage(error, "Update failed"),
      })
      toast.error(`Couldn't update ${entry.name}. See details below.`)
    },
    onSettled: () => setUpdatingId(null),
  })

  const refreshMutation = useMutation({
    mutationFn: async () => ({
      key: directoryQueryKey,
      result: await listDirectory({ registryUrl, force: true }),
    }),
    onSuccess: async ({ key, result }) => {
      queryClient.setQueryData(key, result)
      await queryClient.invalidateQueries({
        queryKey: UPDATE_STATUS_QUERY_KEY,
        exact: true,
      })
      toast.show("Plugin directory refreshed.", { variant: "success" })
    },
    onError: (error: unknown) => {
      toast.error(errorMessage(error, "Refresh failed"))
    },
  })

  const plugins = directory?.plugins ?? NO_PLUGINS
  const installations = directory?.installations ?? NO_INSTALLATIONS
  const updates = useMemo(
    (): ReadonlyMap<string, PluginUpdate> =>
      new Map(
        (updateStatusQuery.data?.updates ?? []).map((update) => [
          update.id,
          update,
        ])
      ),
    [updateStatusQuery.data]
  )
  const categoryLabels = useMemo(
    (): ReadonlyMap<string, string> =>
      new Map(
        (directory?.categories ?? []).map((category) => [
          category.slug,
          category.label,
        ])
      ),
    [directory?.categories]
  )
  const installationsByEntryId = useMemo(
    () => indexInstallations(plugins, installations, registryUrl),
    [plugins, installations, registryUrl]
  )
  const { plugins: pluginEntries, themes: themeEntries } = useMemo(
    () => splitThemes(plugins),
    [plugins]
  )
  // Themes have their own segment, so the category strip only offers what
  // plugins use.
  const categoryOptions = useMemo(
    () => buildCategoryOptions(pluginEntries, directory?.categories ?? []),
    [pluginEntries, directory?.categories]
  )

  // A saved category the registry no longer offers has no chip to deselect it,
  // so drop it instead of silently filtering the list to nothing.
  useEffect(() => {
    if (!settingsHydrated || !directoryQuery.isSuccess) return
    const offered = new Set(categoryOptions.map((option) => option.slug))
    setCategoryFilter((current) => {
      const kept = Array.from(current).filter((slug) => offered.has(slug))
      return kept.length === current.size ? current : new Set(kept)
    })
  }, [categoryOptions, directoryQuery.isSuccess, settingsHydrated])

  // A saved status filter whose data has not arrived (or cannot be had) falls
  // back to showing everything rather than an empty list under a disabled chip.
  const statusAvailable: Record<InstallationStatusFilter, boolean> = {
    all: true,
    installed: inventoryAvailable,
    "not-installed": inventoryAvailable,
    updates: updateStatusQuery.isSuccess,
  }
  const effectiveStatusFilter = statusAvailable[statusFilter]
    ? statusFilter
    : "all"

  const themesActive = segment === "themes"
  const otherSegment: Segment = themesActive ? "plugins" : "themes"

  const pluginSearched = useMemo(
    () =>
      filterBySearchAndCategories(
        pluginEntries,
        search,
        categoryFilter,
        categoryLabels
      ),
    [pluginEntries, search, categoryFilter, categoryLabels]
  )
  // The Themes segment has no category strip, so categories never narrow it.
  const themeSearched = useMemo(
    () =>
      filterBySearchAndCategories(
        themeEntries,
        search,
        NO_CATEGORIES,
        categoryLabels
      ),
    [themeEntries, search, categoryLabels]
  )
  const pluginFiltered = useMemo(
    () =>
      filterByStatus(
        pluginSearched,
        effectiveStatusFilter,
        installationsByEntryId,
        updates
      ),
    [pluginSearched, effectiveStatusFilter, installationsByEntryId, updates]
  )
  const themeFiltered = useMemo(
    () =>
      filterByStatus(
        themeSearched,
        effectiveStatusFilter,
        installationsByEntryId,
        updates
      ),
    [themeSearched, effectiveStatusFilter, installationsByEntryId, updates]
  )
  const searched = themesActive ? themeSearched : pluginSearched
  const filtered = themesActive ? themeFiltered : pluginFiltered
  const otherCount = themesActive ? pluginFiltered.length : themeFiltered.length
  const sorted = useMemo(
    () => sortEntries(filtered, sortMode, installationsByEntryId, updates),
    [filtered, sortMode, installationsByEntryId, updates]
  )
  const statusCounts = useMemo(
    () => countByStatus(searched, installationsByEntryId, updates),
    [searched, installationsByEntryId, updates]
  )

  // Category chips count what each would show under the current search and
  // status filter, so they never promise more than the list can deliver.
  const categoryFacetEntries = useMemo(
    () =>
      filterByStatus(
        filterBySearchAndCategories(
          pluginEntries,
          search,
          NO_CATEGORIES,
          categoryLabels
        ),
        effectiveStatusFilter,
        installationsByEntryId,
        updates
      ),
    [
      pluginEntries,
      search,
      categoryLabels,
      effectiveStatusFilter,
      installationsByEntryId,
      updates,
    ]
  )
  const categoryChips = useMemo(
    () => recountCategories(categoryOptions, categoryFacetEntries),
    [categoryOptions, categoryFacetEntries]
  )

  // Categories are visible chips, so the Filters button counts only what lives
  // inside its sheet.
  const activeFilterCount =
    Number(sortMode !== DEFAULT_DIRECTORY_BROWSE_SETTINGS.sort) +
    Number(effectiveStatusFilter !== DEFAULT_DIRECTORY_BROWSE_SETTINGS.status)
  const categoriesInEffect = themesActive ? 0 : categoryFilter.size
  const isNarrowed =
    search.trim() !== "" || activeFilterCount > 0 || categoriesInEffect > 0
  const clearFilters = () => {
    setSearch("")
    setCategoryFilter(new Set())
    setStatusFilter(DEFAULT_DIRECTORY_BROWSE_SETTINGS.status)
    setSortMode(DEFAULT_DIRECTORY_BROWSE_SETTINGS.sort)
  }

  const defaultBrowseState = isDefaultDirectoryBrowseView({
    query: search,
    categories: browseSettings.categories,
    status: effectiveStatusFilter,
    sort: sortMode,
  })
  const featuredEntries = useMemo(
    () =>
      defaultBrowseState && !themesActive
        ? selectFeatured(filtered, directory?.featured ?? []).slice(
            0,
            FEATURED_LIMIT
          )
        : [],
    [defaultBrowseState, themesActive, filtered, directory?.featured]
  )

  const detailEntry = lastOpenedPluginId
    ? (plugins.find((entry) => entry.id === lastOpenedPluginId) ?? null)
    : null
  const detailInstallations = detailEntry
    ? (installationsByEntryId.get(detailEntry.id) ?? NO_INSTALLATIONS)
    : NO_INSTALLATIONS

  const largeTouchTarget = layout.compact || layout.platform !== "web"
  const availableWidth = screenWidth ?? windowSize.width
  const columns = layout.compact
    ? 2
    : availableWidth < WIDE_THEME_BREAKPOINT
      ? 3
      : 4
  const screenPadding = layout.compact ? space.lg : space.xl
  const contentWidth = Math.min(
    MAX_CONTENT_WIDTH,
    availableWidth - screenPadding * 2
  )
  const tileWidth = Math.max(
    96,
    Math.floor((contentWidth - THEME_GRID_GAP * (columns - 1)) / columns)
  )
  const invalidNotice = invalidListingsNotice(directory?.invalidCount ?? 0)

  const openLink = (url: string) => {
    openExternal(url).catch(() => toast.error("Couldn't open the link."))
  }

  const statusOptions = STATUS_OPTIONS.map(
    ({ value, label }): ChoiceOption<InstallationStatusFilter> => {
      const available = statusAvailable[value]
      return {
        value,
        label,
        detail: available ? String(statusCounts[value]) : undefined,
        accessibilityLabel: `${label}, ${
          available ? countNoun(statusCounts[value], segment) : "unavailable"
        }`,
        disabled: !available,
      }
    }
  )
  const sortOptions = SORT_OPTIONS.map(
    ({ value, label }): ChoiceOption<SortMode> => ({
      value,
      label,
      accessibilityLabel: `Sort by ${label}`,
    })
  )

  const styles = useMemo(() => {
    const touch = largeTouchTarget ? MIN_TOUCH : undefined
    const muted = mutedTextColor(theme)
    return {
      screen: {
        flex: 1,
        padding: screenPadding,
        backgroundColor: theme.colors.surface0,
      },
      listContent: {
        width: "100%" as const,
        maxWidth: MAX_CONTENT_WIDTH,
        alignSelf: "center" as const,
        gap: space.sm,
        paddingBottom: space.xl,
      },
      gridContent: {
        width: "100%" as const,
        maxWidth: MAX_CONTENT_WIDTH,
        alignSelf: "center" as const,
        gap: THEME_GRID_GAP,
        paddingBottom: space.xl,
      },
      gridRow: { gap: THEME_GRID_GAP },
      listHeader: { gap: space.md, paddingBottom: space.sm },
      titleRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: space.sm,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: 20,
        lineHeight: 28,
        fontWeight: "600" as const,
      },
      headerActions: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.sm,
      },
      segments: { flexDirection: "row" as const, gap: space.sm },
      searchRow: {
        flexDirection: "row" as const,
        alignItems: "stretch" as const,
        gap: space.sm,
      },
      searchInput: {
        flex: 1,
        minHeight: touch ?? 36,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        fontSize: 14,
      },
      button: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: space.sm,
        minHeight: touch ?? 32,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: radius.md,
        paddingHorizontal: space.md,
        backgroundColor: theme.colors.surface1,
      },
      buttonText: {
        color: theme.colors.foreground,
        fontSize: 13,
        fontWeight: "600" as const,
      },
      countBadge: {
        minWidth: 18,
        alignItems: "center" as const,
        borderRadius: radius.sm,
        paddingHorizontal: space.xs,
        backgroundColor: theme.colors.accent,
      },
      countBadgeText: {
        color: theme.colors.accentForeground,
        fontSize: 11,
        fontWeight: "600" as const,
      },
      textAction: {
        justifyContent: "center" as const,
        minHeight: touch ?? 32,
        paddingHorizontal: space.xs,
      },
      textActionText: {
        color: theme.colors.foreground,
        fontSize: 13,
        textDecorationLine: "underline" as const,
      },
      caption: { color: muted, fontSize: 12 },
      chipWrap: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: space.sm,
      },
      chipStrip: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: space.sm,
        paddingRight: space.lg,
      },
      feedbackText: { color: muted, fontSize: 12, lineHeight: 18 },
      banner: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: space.sm,
        borderWidth: 1,
        borderColor: theme.colors.statusWarning,
        borderRadius: radius.md,
        padding: space.md,
        backgroundColor: theme.colors.surface1,
      },
      bannerText: {
        flex: 1,
        flexBasis: 200,
        color: mutedTextColor(theme, theme.colors.surface1),
        fontSize: 12,
        lineHeight: 18,
      },
      featured: { gap: space.sm },
      sectionTitle: {
        color: theme.colors.foreground,
        fontSize: 14,
        lineHeight: 20,
        fontWeight: "600" as const,
      },
      stateStack: { gap: space.md },
      sheet: { gap: space.lg },
    }
  }, [theme, screenPadding, largeTouchTarget])

  if (galleryEntry) {
    return (
      <PluginGalleryPage
        entry={galleryEntry}
        theme={theme}
        compact={layout.compact}
        onBack={() => setGalleryEntry(null)}
      />
    )
  }

  if (detailEntry) {
    return (
      <PluginDetailPage
        entry={detailEntry}
        theme={theme}
        compact={layout.compact}
        registryUrl={registryUrl}
        installSupported={directory?.installSupported ?? false}
        installations={detailInstallations}
        inventoryAvailable={inventoryAvailable}
        updates={updates}
        categoryLabels={categoryLabels}
        installing={installingId === detailEntry.id}
        updatingId={updatingId}
        installError={
          installFailure?.entryId === detailEntry.id
            ? installFailure.message
            : null
        }
        updateError={
          updateFailure?.entryId === detailEntry.id
            ? updateFailure.message
            : null
        }
        onInstall={() => installMutation.mutate(detailEntry)}
        onUpdate={(installation) =>
          updateMutation.mutate({ entry: detailEntry, installation })
        }
        autoUpdateOptOuts={settingsValues?.autoUpdateOptOuts ?? []}
        autoUpdateSaving={
          settings.status !== "ready" ||
          settingsSaving ||
          pendingAutomaticPreference !== null
        }
        onAutoUpdateChange={saveAutomaticUpdatePreference}
        onOpenGallery={() => setGalleryEntry(detailEntry)}
        onBack={() => setLastOpenedPluginId(null)}
      />
    )
  }

  const renderRow = (
    entry: DirectoryEntry,
    dateBadge?: PluginRowDateBadge,
    key?: string
  ) => (
    <PluginRow
      key={key}
      entry={entry}
      theme={theme}
      compact={layout.compact}
      installations={installationsByEntryId.get(entry.id) ?? NO_INSTALLATIONS}
      updates={updates}
      dateBadge={dateBadge}
      onPress={() => setLastOpenedPluginId(entry.id)}
    />
  )

  const refreshing = refreshMutation.isPending || directoryQuery.isFetching
  const segmentCount = (value: Segment) =>
    value === "themes" ? themeFiltered.length : pluginFiltered.length

  const categoryChipElements =
    categoryChips.length > 0 ? (
      <>
        <Chip
          role="button"
          label={`All ${categoryFacetEntries.length}`}
          accessibilityLabel={filterAccessibilityLabel(
            "clear",
            "category",
            categoryFacetEntries.length
          )}
          selected={categoryFilter.size === 0}
          theme={theme}
          largeTouchTarget={largeTouchTarget}
          onPress={() => setCategoryFilter(new Set())}
        />
        {categoryChips.map((option) => (
          <Chip
            key={option.slug}
            role="button"
            label={`${option.label} ${option.count}`}
            accessibilityLabel={filterAccessibilityLabel(
              "filter",
              option.label,
              option.count
            )}
            selected={categoryFilter.has(option.slug)}
            theme={theme}
            largeTouchTarget={largeTouchTarget}
            onPress={() =>
              setCategoryFilter((current) => toggle(current, option.slug))
            }
          />
        ))}
      </>
    ) : null

  const header = (
    <View style={styles.listHeader}>
      <View style={styles.titleRow}>
        <Text role="heading" aria-level={1} style={styles.title}>
          Plugin directory
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Submit a plugin"
            style={styles.textAction}
            onPress={() => openLink(SUBMIT_URL)}
          >
            <Text style={styles.textActionText}>Submit a plugin</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh plugin directory"
            disabled={settingsPending || refreshing}
            style={[
              styles.button,
              settingsPending || refreshing ? { opacity: 0.5 } : null,
            ]}
            onPress={() => refreshMutation.mutate()}
          >
            <Text style={styles.buttonText}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View
        accessibilityRole="tablist"
        accessibilityLabel="Browse plugins or themes"
        style={styles.segments}
      >
        {SEGMENT_ORDER.map((value) => (
          <Chip
            key={value}
            role="tab"
            size="lg"
            grow={layout.compact}
            label={
              directory
                ? `${SEGMENT_INFO[value].label} ${segmentCount(value)}`
                : SEGMENT_INFO[value].label
            }
            accessibilityLabel={
              directory
                ? `${SEGMENT_INFO[value].label}, ${countNoun(segmentCount(value), value)}`
                : SEGMENT_INFO[value].label
            }
            selected={segment === value}
            theme={theme}
            largeTouchTarget={largeTouchTarget}
            onPress={() => setSegment(value)}
          />
        ))}
      </View>

      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel={`Search Paseo ${SEGMENT_INFO[segment].label.toLowerCase()}`}
          placeholder={`Search ${SEGMENT_INFO[segment].label.toLowerCase()}…`}
          value={search}
          onChangeText={(value) => setSearch(value.slice(0, 200))}
          style={styles.searchInput}
          placeholderTextColor={mutedTextColor(theme, theme.colors.surface1)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ""}`}
          aria-expanded={filtersOpen}
          style={styles.button}
          onPress={() => setFiltersOpen(true)}
        >
          <Text style={styles.buttonText}>Filters</Text>
          {activeFilterCount > 0 ? (
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      {directory ? (
        <Text accessibilityLiveRegion="polite" style={styles.caption}>
          {countNoun(sorted.length, segment)}
        </Text>
      ) : null}

      {!themesActive && categoryChipElements ? (
        layout.compact ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Plugin categories"
            contentContainerStyle={styles.chipStrip}
          >
            {categoryChipElements}
          </ScrollView>
        ) : (
          <View accessibilityLabel="Plugin categories" style={styles.chipWrap}>
            {categoryChipElements}
          </View>
        )
      ) : null}

      {settingsPending ? (
        <Text style={styles.feedbackText}>Loading Paseo Cafe settings…</Text>
      ) : null}
      {settings.status === "error" || settings.status === "invalid" ? (
        <Text accessibilityRole="alert" style={styles.feedbackText}>
          Paseo Cafe settings need attention, so the official registry is in
          use: {settings.error}
        </Text>
      ) : null}
      {registryUrl !== DEFAULT_REGISTRY_URL ? (
        <Text style={styles.feedbackText}>
          Using a custom registry: {registryUrl}
        </Text>
      ) : null}
      {updateStatusQuery.isFetching ? (
        <Text style={styles.feedbackText}>Checking for plugin updates…</Text>
      ) : null}
      {updateStatusQuery.isError ? (
        <Text accessibilityRole="alert" style={styles.feedbackText}>
          Update status is unavailable: {updateStatusQuery.error.message}
        </Text>
      ) : null}
      {directory?.installationError ? (
        <Text accessibilityRole="alert" style={styles.feedbackText}>
          Couldn't check installed plugins: {directory.installationError}
        </Text>
      ) : null}
      {invalidNotice ? (
        <Text style={styles.feedbackText}>{invalidNotice}</Text>
      ) : null}
      {directoryQuery.isError && directory ? (
        <View accessibilityRole="alert" style={styles.banner}>
          <Text style={styles.bannerText}>
            Couldn't refresh the plugin directory:{" "}
            {directoryQuery.error.message}. Showing the last loaded list.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading the plugin directory"
            disabled={directoryQuery.isFetching}
            style={[
              styles.button,
              directoryQuery.isFetching ? { opacity: 0.5 } : null,
            ]}
            onPress={() => void directoryQuery.refetch()}
          >
            <Text style={styles.buttonText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {featuredEntries.length > 0 ? (
        <View style={styles.featured}>
          <Text role="heading" aria-level={2} style={styles.sectionTitle}>
            Featured
          </Text>
          {featuredEntries.map((entry) =>
            renderRow(entry, undefined, `featured-${entry.id}`)
          )}
          <Text
            role="heading"
            aria-level={2}
            style={[styles.sectionTitle, { marginTop: space.sm }]}
          >
            All plugins
          </Text>
        </View>
      ) : null}
    </View>
  )

  const otherLabel = SEGMENT_INFO[otherSegment].label
  const segmentLabel = SEGMENT_INFO[segment].label
  const segmentEntryCount = themesActive
    ? themeEntries.length
    : pluginEntries.length

  let emptyState: ReactElement | null = null
  if (settingsPending || directoryQuery.isPending) {
    emptyState = (
      <View style={styles.stateStack}>
        <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>
          Loading {segmentLabel.toLowerCase()}…
        </Text>
        {themesActive ? (
          <ThemeGridSkeleton
            theme={theme}
            columns={columns}
            count={columns * 3}
          />
        ) : (
          <RowSkeleton
            theme={theme}
            compact={layout.compact}
            count={SKELETON_ROWS}
          />
        )}
      </View>
    )
  } else if (directoryQuery.isError && !directory) {
    emptyState = (
      <StateMessage
        theme={theme}
        tone="error"
        compact={largeTouchTarget}
        title="Couldn't load the plugin directory"
        body={`${directoryQuery.error.message}\nRegistry: ${registryUrl}`}
        actionLabel="Retry"
        onAction={() => void directoryQuery.refetch()}
      />
    )
  } else if (directory && plugins.length === 0) {
    emptyState = (
      <StateMessage
        theme={theme}
        compact={largeTouchTarget}
        title="No plugins listed"
        body="This registry doesn't list any plugins."
      />
    )
  } else if (directory && otherCount > 0 && segmentEntryCount > 0) {
    emptyState = (
      <StateMessage
        theme={theme}
        compact={largeTouchTarget}
        title={`No ${segmentLabel.toLowerCase()} match`}
        body={`Nothing in ${segmentLabel} matches the current search and filters.`}
        actionLabel={`${otherCount} ${otherCount === 1 ? "result" : "results"} in ${otherLabel}`}
        onAction={() => setSegment(otherSegment)}
      />
    )
  } else if (directory && segmentEntryCount === 0) {
    emptyState = (
      <StateMessage
        theme={theme}
        compact={largeTouchTarget}
        title={`No ${segmentLabel.toLowerCase()} listed`}
        body={`This registry doesn't list any ${segmentLabel.toLowerCase()}.`}
      />
    )
  } else if (
    directory &&
    effectiveStatusFilter === "updates" &&
    search.trim() === "" &&
    categoriesInEffect === 0
  ) {
    emptyState = (
      <StateMessage
        theme={theme}
        compact={largeTouchTarget}
        title="All up to date"
        body={`All installed ${segmentLabel.toLowerCase()} are up to date.`}
      />
    )
  } else if (directory) {
    emptyState = (
      <StateMessage
        theme={theme}
        compact={largeTouchTarget}
        title="No results"
        body={`No ${segmentLabel.toLowerCase()} match the current search and filters.`}
        actionLabel={isNarrowed ? "Clear filters" : undefined}
        onAction={isNarrowed ? clearFilters : undefined}
      />
    )
  }

  const filtersSheet = (
    <Modal title="Filters" open={filtersOpen} onOpenChange={setFiltersOpen}>
      <Modal.Content>
        <View style={styles.sheet}>
          <OptionGroup
            label="Show"
            accessibilityLabel={`${segmentLabel} installation status`}
            options={statusOptions}
            selected={effectiveStatusFilter}
            theme={theme}
            largeTouchTarget={largeTouchTarget}
            onSelect={setStatusFilter}
          />
          <OptionGroup
            label="Sort by"
            accessibilityLabel={`${segmentLabel} sort order`}
            options={sortOptions}
            selected={sortMode}
            theme={theme}
            largeTouchTarget={largeTouchTarget}
            onSelect={setSortMode}
          />
          {activeFilterCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset status and sort"
              style={[styles.button, { alignSelf: "flex-start" }]}
              onPress={() => {
                setStatusFilter(DEFAULT_DIRECTORY_BROWSE_SETTINGS.status)
                setSortMode(DEFAULT_DIRECTORY_BROWSE_SETTINGS.sort)
              }}
            >
              <Text style={styles.buttonText}>Reset</Text>
            </Pressable>
          ) : null}
        </View>
      </Modal.Content>
    </Modal>
  )

  return (
    <View
      style={styles.screen}
      onLayout={(event) =>
        setScreenWidth(Math.round(event.nativeEvent.layout.width))
      }
    >
      {themesActive ? (
        <FlatList<DirectoryEntry>
          key={`themes-${columns}`}
          data={sorted}
          numColumns={columns}
          columnWrapperStyle={styles.gridRow}
          keyExtractor={(entry: DirectoryEntry) => entry.id}
          contentContainerStyle={styles.gridContent}
          initialNumToRender={Math.ceil(8 / columns)}
          windowSize={5}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyState}
          renderItem={({ item }: { item: DirectoryEntry }) => (
            <ThemeCard
              entry={item}
              theme={theme}
              width={tileWidth}
              installations={
                installationsByEntryId.get(item.id) ?? NO_INSTALLATIONS
              }
              updates={updates}
              onPress={() => setLastOpenedPluginId(item.id)}
            />
          )}
        />
      ) : (
        <FlatList<DirectoryEntry>
          key="plugins"
          data={sorted}
          keyExtractor={(entry: DirectoryEntry) => entry.id}
          contentContainerStyle={styles.listContent}
          windowSize={7}
          ListHeaderComponent={header}
          ListEmptyComponent={emptyState}
          renderItem={({ item }: { item: DirectoryEntry }) =>
            renderRow(item, dateBadgeForSortMode(sortMode))
          }
        />
      )}
      {filtersSheet}
    </View>
  )
}
