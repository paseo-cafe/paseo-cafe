import type { PluginTheme } from "@getpaseo/plugin"
import type { PluginSurfaceProps } from "@getpaseo/plugin/client"
import { useRpc, useSettings } from "@getpaseo/plugin/client"
import {
  FlatList,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/react-native"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import { Pressable, Text, View } from "react-native"
import type {
  DirectoryBrowseSettings,
  DirectoryCategory,
  DirectoryEntry,
  InstalledPlugin,
} from "../shared/directory"
import {
  DEFAULT_DIRECTORY_BROWSE_SETTINGS,
  DIRECTORY_CATEGORIES,
  DIRECTORY_CATEGORY_LABELS,
  directoryInstallRpc,
  directoryListRpc,
  directorySettings,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
  findInstallations,
  normalizeDirectoryCategory,
} from "../shared/directory"
import { PluginDetailPage } from "./PluginDetailPage"
import { PluginGalleryPage } from "./PluginGalleryPage"
import { PluginRow } from "./PluginRow"

const DIRECTORY_QUERY_KEY = "paseo-cafe-directory"
const UPDATE_STATUS_QUERY_KEY = "paseo-cafe-update-status"

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

interface FilterRowProps {
  label: string
  options: string[]
  selected: ReadonlySet<string>
  theme: PluginTheme
  formatOption?: (value: string) => string
  onToggle: (value: string) => void
  onClear: () => void
}

function FilterRow({
  label,
  options,
  selected,
  theme,
  formatOption,
  onToggle,
  onClear,
}: FilterRowProps) {
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        flexWrap: "wrap" as const,
      },
      label: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        marginRight: 2,
      },
      chip: (active: boolean) => ({
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
      }),
      chipText: (active: boolean) => ({
        fontSize: 12,
        color: active
          ? theme.colors.accentForeground
          : theme.colors.foregroundMuted,
      }),
    }),
    [theme]
  )

  if (options.length === 0) return null

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}:</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Clear ${label.toLowerCase()} filter`}
        accessibilityState={{ selected: selected.size === 0 }}
        style={styles.chip(selected.size === 0)}
        onPress={onClear}
      >
        <Text style={styles.chipText(selected.size === 0)}>All</Text>
      </Pressable>
      {options.map((option) => {
        const active = selected.has(option)
        const optionLabel = formatOption?.(option) ?? option
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${optionLabel}`}
            accessibilityState={{ selected: active }}
            style={styles.chip(active)}
            onPress={() => onToggle(option)}
          >
            <Text style={styles.chipText(active)}>{optionLabel}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

type InstallationStatusFilter = DirectoryBrowseSettings["status"]

interface StatusFilterOption {
  value: InstallationStatusFilter
  label: string
  count?: number
  disabled?: boolean
}

function StatusFilterRow({
  options,
  selected,
  theme,
  onSelect,
}: {
  options: readonly StatusFilterOption[]
  selected: InstallationStatusFilter
  theme: PluginTheme
  onSelect: (value: InstallationStatusFilter) => void
}) {
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        flexWrap: "wrap" as const,
      },
      label: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        marginRight: 2,
      },
      chip: (active: boolean) => ({
        minHeight: 44,
        justifyContent: "center" as const,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
      }),
      chipText: (active: boolean) => ({
        color: active
          ? theme.colors.accentForeground
          : theme.colors.foregroundMuted,
        fontSize: 12,
        fontWeight: active ? ("600" as const) : ("400" as const),
      }),
    }),
    [theme]
  )

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Plugin installation status"
      style={styles.row}
    >
      <Text style={styles.label}>Show:</Text>
      {options.map((option) => {
        const active = selected === option.value
        const countLabel =
          option.count === undefined ? "unavailable" : `${option.count} plugins`
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${option.label}, ${countLabel}`}
            accessibilityState={{ checked: active, disabled: option.disabled }}
            aria-checked={active}
            aria-disabled={option.disabled}
            disabled={option.disabled}
            style={[
              styles.chip(active),
              option.disabled ? { opacity: 0.5 } : null,
            ]}
            onPress={() => onSelect(option.value)}
          >
            <Text style={styles.chipText(active)}>
              {option.label} {option.count ?? "—"}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
type DirectoryListResult = {
  plugins: readonly DirectoryEntry[]
  fetchedAt: string
  installations?: readonly InstalledPlugin[]
  installationError?: string
}

type UpdateStatusResult = {
  installations: readonly InstalledPlugin[]
}

type InstallResult = {
  ok: boolean
  message: string
}

type UpdateResult = {
  ok: boolean
  message: string
  updated?: boolean
}

type SortMode = DirectoryBrowseSettings["sort"]

interface SortOption {
  value: SortMode
  label: string
}

const SORT_OPTIONS: readonly SortOption[] = [
  { value: "updates-first", label: "Updates first" },
  { value: "popular", label: "Popular" },
  { value: "recent", label: "Recently updated" },
  { value: "a-z", label: "A–Z" },
]

const FEATURED_LIMIT = 5

function normalizeText(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? ""
}

function compareText(a: string | undefined, b: string | undefined): number {
  const left = normalizeText(a)
  const right = normalizeText(b)
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function timeValue(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function compareDateDesc(a: string | undefined, b: string | undefined): number {
  return timeValue(b) - timeValue(a)
}

function compareStarsDesc(a: DirectoryEntry, b: DirectoryEntry): number {
  return (b.repoMeta?.stars ?? 0) - (a.repoMeta?.stars ?? 0)
}

function entryHasUpdate(
  entry: DirectoryEntry,
  installationByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>
): boolean {
  return (
    installationByEntryId
      .get(entry.id)
      ?.some((installation) => installation.updateState === "available") ??
    false
  )
}

function compareEntries(
  a: DirectoryEntry,
  b: DirectoryEntry,
  sortMode: SortMode,
  installationByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>
): number {
  if (sortMode === "updates-first") {
    return (
      Number(entryHasUpdate(b, installationByEntryId)) -
        Number(entryHasUpdate(a, installationByEntryId)) ||
      compareStarsDesc(a, b) ||
      compareDateDesc(a.repoMeta?.pushedAt, b.repoMeta?.pushedAt) ||
      compareText(a.name, b.name) ||
      compareText(a.repo, b.repo) ||
      compareText(a.id, b.id)
    )
  }

  if (sortMode === "popular") {
    return (
      compareStarsDesc(a, b) ||
      compareDateDesc(a.repoMeta?.pushedAt, b.repoMeta?.pushedAt) ||
      compareText(a.name, b.name) ||
      compareText(a.repo, b.repo) ||
      compareText(a.id, b.id)
    )
  }

  if (sortMode === "recent") {
    return (
      compareDateDesc(a.repoMeta?.pushedAt, b.repoMeta?.pushedAt) ||
      compareStarsDesc(a, b) ||
      compareText(a.name, b.name) ||
      compareText(a.repo, b.repo) ||
      compareText(a.id, b.id)
    )
  }

  return (
    compareText(a.name, b.name) ||
    compareText(a.repo, b.repo) ||
    compareText(a.id, b.id)
  )
}

function sortEntries(
  entries: readonly DirectoryEntry[],
  sortMode: SortMode,
  installationByEntryId: ReadonlyMap<string, readonly InstalledPlugin[]>
): DirectoryEntry[] {
  return [...entries].sort((a, b) =>
    compareEntries(a, b, sortMode, installationByEntryId)
  )
}

function isDefaultBrowseState(
  search: string,
  categoryFilter: ReadonlySet<string>,
  platformFilter: ReadonlySet<string>,
  statusFilter: InstallationStatusFilter
): boolean {
  return (
    search.trim() === "" &&
    categoryFilter.size === 0 &&
    platformFilter.size === 0 &&
    statusFilter === "all"
  )
}

function SortRow({
  options,
  selected,
  theme,
  onSelect,
}: {
  options: readonly SortOption[]
  selected: SortMode
  theme: PluginTheme
  onSelect: (value: SortMode) => void
}) {
  const styles = useMemo(
    () => ({
      row: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        flexWrap: "wrap" as const,
      },
      label: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        marginRight: 2,
      },
      chip: (active: boolean) => ({
        minHeight: 44,
        justifyContent: "center" as const,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
      }),
      chipText: (active: boolean) => ({
        color: active
          ? theme.colors.accentForeground
          : theme.colors.foregroundMuted,
        fontSize: 12,
        fontWeight: active ? ("600" as const) : ("400" as const),
      }),
    }),
    [theme]
  )

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Plugin sort order"
      style={styles.row}
    >
      <Text style={styles.label}>Sort:</Text>
      {options.map((option) => {
        const active = selected === option.value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`Sort by ${option.label}`}
            accessibilityState={{ checked: active }}
            aria-checked={active}
            style={styles.chip(active)}
            onPress={() => onSelect(option.value)}
          >
            <Text style={styles.chipText(active)}>{option.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function DirectorySurface({ theme, layout }: PluginSurfaceProps) {
  const listDirectory = useRpc(directoryListRpc)
  const installPlugin = useRpc(directoryInstallRpc)
  const updatePlugin = useRpc(directoryUpdateRpc)
  const listUpdateStatus = useRpc(directoryUpdateStatusRpc)
  const settings = useSettings(directorySettings)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<
    ReadonlySet<DirectoryCategory>
  >(new Set())
  const [platformFilter, setPlatformFilter] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [statusFilter, setStatusFilter] =
    useState<InstallationStatusFilter>("all")
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installFailure, setInstallFailure] = useState<{
    entryId: string
    message: string
  } | null>(null)
  const [sortMode, setSortMode] = useState<SortMode>("updates-first")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [updateFailure, setUpdateFailure] = useState<{
    entryId: string
    message: string
  } | null>(null)
  const [detailEntry, setDetailEntry] = useState<DirectoryEntry | null>(null)
  const [galleryEntry, setGalleryEntry] = useState<DirectoryEntry | null>(null)
  const [lastOpenedPluginId, setLastOpenedPluginId] = useState<string | null>(
    null
  )
  const [settingsHydrated, setSettingsHydrated] = useState(false)
  const hasHydratedSettings = useRef(false)
  const hasRestoredLastOpened = useRef(false)

  const settingsValues = settings.status === "ready" ? settings.values : null
  const settingsRevision =
    settings.status === "ready" ? settings.revision : null
  const {
    saving: settingsSaving,
    save: saveSettings,
    reload: reloadSettings,
  } = settings
  const storedBrowse = settingsValues
    ? (settingsValues.browse ?? DEFAULT_DIRECTORY_BROWSE_SETTINGS)
    : null
  const storedBrowseKey = storedBrowse ? JSON.stringify(storedBrowse) : null
  const browseSettings = useMemo<DirectoryBrowseSettings>(
    () => ({
      query: search,
      categories: DIRECTORY_CATEGORIES.filter((category) =>
        categoryFilter.has(category)
      ),
      platforms: Array.from(platformFilter).sort(),
      status: statusFilter,
      sort: sortMode,
      lastOpenedPluginId,
    }),
    [
      search,
      categoryFilter,
      platformFilter,
      statusFilter,
      sortMode,
      lastOpenedPluginId,
    ]
  )

  useEffect(() => {
    if (hasHydratedSettings.current || storedBrowse === null) return

    hasHydratedSettings.current = true
    setSearch(storedBrowse.query)
    setCategoryFilter(new Set(storedBrowse.categories))
    setPlatformFilter(new Set(storedBrowse.platforms))
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
      settingsSaving ||
      storedBrowseKey === JSON.stringify(browseSettings)
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
    storedBrowseKey,
  ])

  // Undefined until settings are readable: the handler then falls back to
  // PASEO_CAFE_DIRECTORY_URL or the default catalog, so an unreadable or
  // invalid settings document still shows a catalog instead of a blank surface.
  const baseUrl =
    settings.status === "ready" ? settings.values.directoryUrl : undefined
  const settingsPending = settings.status === "loading"
  const queryKey = [DIRECTORY_QUERY_KEY, baseUrl]
  const updateStatusQueryKey = [UPDATE_STATUS_QUERY_KEY, baseUrl]

  const directoryQuery = useQuery<DirectoryListResult>({
    queryKey,
    queryFn: async (): Promise<DirectoryListResult> =>
      listDirectory({ baseUrl, force: false }) as Promise<DirectoryListResult>,
    // Only the first read is gated, so the default catalog is never fetched
    // and then immediately replaced by the configured one.
    enabled: !settingsPending,
    staleTime: 60_000,
  })
  const inventoryAvailable = directoryQuery.data?.installations !== undefined
  const updateStatusQuery = useQuery<UpdateStatusResult>({
    queryKey: updateStatusQueryKey,
    queryFn: async (): Promise<UpdateStatusResult> =>
      listUpdateStatus({ baseUrl }) as Promise<UpdateStatusResult>,
    enabled: inventoryAvailable,
    staleTime: 60_000,
  })

  const installMutation = useMutation<InstallResult, unknown, DirectoryEntry>({
    mutationFn: (entry: DirectoryEntry): Promise<InstallResult> => {
      setInstallingId(entry.id)
      setInstallFailure(null)
      return installPlugin({
        repo: entry.repo,
        path: entry.path,
      }) as Promise<InstallResult>
    },
    onSuccess: async (result: InstallResult, entry: DirectoryEntry) => {
      if (result.ok) {
        setInstallFailure(null)
        toast.show(`Installed ${entry.name}`, { variant: "success" })
        await queryClient.invalidateQueries({ queryKey, exact: true })
        await queryClient.invalidateQueries({
          queryKey: updateStatusQueryKey,
          exact: true,
        })
      } else {
        setInstallFailure({ entryId: entry.id, message: result.message })
        toast.error(`Couldn't install ${entry.name}. See details below.`)
      }
    },
    onError: (error: unknown, entry: DirectoryEntry) => {
      const message = error instanceof Error ? error.message : "Install failed"
      setInstallFailure({ entryId: entry.id, message })
      toast.error(`Couldn't install ${entry.name}. See details below.`)
    },

    onSettled: () => setInstallingId(null),
  })

  const updateMutation = useMutation<
    UpdateResult,
    unknown,
    { entry: DirectoryEntry; installation: InstalledPlugin }
  >({
    mutationFn: ({
      entry,
      installation,
    }: {
      entry: DirectoryEntry
      installation: InstalledPlugin
    }): Promise<UpdateResult> => {
      setUpdatingId(installation.id)
      setUpdateFailure(null)
      return updatePlugin({
        pluginId: installation.id,
        entry: { id: entry.id, repo: entry.repo, path: entry.path },
      }) as Promise<UpdateResult>
    },
    onSuccess: async (
      result: UpdateResult,
      { entry }: { entry: DirectoryEntry }
    ) => {
      if (result.ok) {
        setUpdateFailure(null)
        toast.show(result.message, { variant: "success" })
        await queryClient.invalidateQueries({ queryKey, exact: true })
        await queryClient.invalidateQueries({
          queryKey: updateStatusQueryKey,
          exact: true,
        })
      } else {
        setUpdateFailure({ entryId: entry.id, message: result.message })
        toast.error(`Couldn't update ${entry.name}. See details below.`)
      }
    },
    onError: (error: unknown, { entry }: { entry: DirectoryEntry }) => {
      const message = error instanceof Error ? error.message : "Update failed"
      setUpdateFailure({ entryId: entry.id, message })
      toast.error(`Couldn't update ${entry.name}. See details below.`)
    },

    onSettled: () => setUpdatingId(null),
  })

  const refreshMutation = useMutation<
    { key: readonly [string, string | undefined]; result: DirectoryListResult },
    unknown,
    void
  >({
    // The key travels with the request: switching the Catalog URL while a
    // refresh is in flight must not file the old catalog under the new key.
    mutationFn: async (): Promise<{
      key: readonly [string, string | undefined]
      result: DirectoryListResult
    }> => {
      const key = [DIRECTORY_QUERY_KEY, baseUrl] as const
      return {
        key,
        result: (await listDirectory({
          baseUrl,
          force: true,
        })) as DirectoryListResult,
      }
    },
    onSuccess: async ({
      key,
      result,
    }: {
      key: readonly [string, string | undefined]
      result: DirectoryListResult
    }) => {
      queryClient.setQueryData(key, result)
      await queryClient.invalidateQueries({
        queryKey: updateStatusQueryKey,
        exact: true,
      })
      toast.show("Paseo Cafe refreshed.", { variant: "success" })
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Refresh failed")
    },
  })

  const catalogPlugins = directoryQuery.data?.plugins ?? []
  const plugins = useMemo(
    () =>
      catalogPlugins.map((entry) => ({
        ...entry,
        categories: Array.from(
          new Set(
            entry.categories.map(
              (category) =>
                DIRECTORY_CATEGORY_LABELS[normalizeDirectoryCategory(category)]
            )
          )
        ),
      })),
    [catalogPlugins]
  )
  useEffect(() => {
    if (
      !settingsHydrated ||
      hasRestoredLastOpened.current ||
      !directoryQuery.isSuccess
    ) {
      return
    }

    hasRestoredLastOpened.current = true
    if (!lastOpenedPluginId) return
    const lastOpened = plugins.find((entry) => entry.id === lastOpenedPluginId)
    if (lastOpened) setDetailEntry(lastOpened)
  }, [directoryQuery.isSuccess, lastOpenedPluginId, plugins, settingsHydrated])
  const installations = inventoryAvailable
    ? (updateStatusQuery.data?.installations ??
      directoryQuery.data?.installations ??
      [])
    : []
  const installationByEntryId = useMemo(
    (): Map<string, InstalledPlugin[]> =>
      new Map<string, InstalledPlugin[]>(
        plugins.flatMap((entry: DirectoryEntry) => {
          const matches = findInstallations(entry, installations)
          return matches.length > 0 ? [[entry.id, matches] as const] : []
        })
      ),
    [plugins, installations]
  )
  const detailInstallations = detailEntry
    ? (installationByEntryId.get(detailEntry.id) ?? [])
    : []

  const allCategories = useMemo((): DirectoryCategory[] => {
    const present = new Set(
      plugins.flatMap((entry) =>
        entry.categories.map(normalizeDirectoryCategory)
      )
    )
    return DIRECTORY_CATEGORIES.filter((category) => present.has(category))
  }, [plugins])
  const allPlatforms = useMemo(
    (): string[] =>
      Array.from(
        new Set(plugins.flatMap((entry: DirectoryEntry) => entry.platforms))
      ).sort(),
    [plugins]
  )

  const nonStatusFiltered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return plugins.filter((entry) => {
      if (query) {
        const haystack = [
          entry.id,
          entry.name,
          entry.description,
          entry.repo,
          entry.author,
          entry.owner?.login,
          entry.paseoVersionRequirement,
          ...entry.categories,
          ...entry.platforms,
          ...entry.caveats,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (
        categoryFilter.size > 0 &&
        !entry.categories.some((category) =>
          categoryFilter.has(normalizeDirectoryCategory(category))
        )
      )
        return false
      if (
        platformFilter.size > 0 &&
        !entry.platforms.some((platform) => platformFilter.has(platform))
      )
        return false
      return true
    })
  }, [plugins, search, categoryFilter, platformFilter])

  const installedCount = nonStatusFiltered.filter(
    (entry) => (installationByEntryId.get(entry.id)?.length ?? 0) > 0
  ).length
  const updateCount = nonStatusFiltered.filter((entry) =>
    installationByEntryId
      .get(entry.id)
      ?.some((installation) => installation.updateState === "available")
  ).length
  const statusOptions: readonly StatusFilterOption[] = [
    { value: "all", label: "All", count: nonStatusFiltered.length },
    {
      value: "installed",
      label: "Installed",
      count: inventoryAvailable ? installedCount : undefined,
      disabled: !inventoryAvailable,
    },
    {
      value: "updates",
      label: "Updates",
      count: updateStatusQuery.isSuccess ? updateCount : undefined,
      disabled: !updateStatusQuery.isSuccess,
    },
    {
      value: "not-installed",
      label: "Not installed",
      count: inventoryAvailable
        ? nonStatusFiltered.length - installedCount
        : undefined,
      disabled: !inventoryAvailable,
    },
  ]
  const effectiveStatusFilter = inventoryAvailable ? statusFilter : "all"
  const filtered = useMemo(
    () =>
      nonStatusFiltered.filter((entry) => {
        const matches = installationByEntryId.get(entry.id) ?? []
        if (effectiveStatusFilter === "installed") return matches.length > 0
        if (effectiveStatusFilter === "updates") {
          return matches.some(
            (installation) => installation.updateState === "available"
          )
        }
        if (effectiveStatusFilter === "not-installed")
          return matches.length === 0
        return true
      }),
    [nonStatusFiltered, effectiveStatusFilter, installationByEntryId]
  )
  const defaultBrowseState = isDefaultBrowseState(
    search,
    categoryFilter,
    platformFilter,
    statusFilter
  )

  const sorted = useMemo(
    () => sortEntries(filtered, sortMode, installationByEntryId),
    [filtered, sortMode, installationByEntryId]
  )

  const popularHighlights = useMemo(
    () =>
      defaultBrowseState
        ? sortEntries(filtered, "popular", installationByEntryId).slice(
            0,
            FEATURED_LIMIT
          )
        : [],
    [defaultBrowseState, filtered, installationByEntryId]
  )
  const recentHighlights = useMemo(
    () =>
      defaultBrowseState
        ? sortEntries(filtered, "recent", installationByEntryId).slice(
            0,
            FEATURED_LIMIT
          )
        : [],
    [defaultBrowseState, filtered, installationByEntryId]
  )

  function openPlugin(entry: DirectoryEntry) {
    setDetailEntry(entry)
    setLastOpenedPluginId(entry.id)
  }

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        gap: 12,
        backgroundColor: theme.colors.surface0,
      },
      title: {
        color: theme.colors.foreground,
        fontSize: layout.compact ? 20 : 24,
        fontWeight: "700" as const,
      },
      subtitle: { color: theme.colors.foregroundMuted, fontSize: 13 },
      searchInput: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        color: theme.colors.foreground,
      },
      filtersBlock: { gap: 8 },
      featuredBlock: { gap: 10 },
      featuredSection: { gap: 10 },
      featuredItems: { gap: 12 },
      featuredHeader: {
        color: theme.colors.foreground,
        fontSize: 14,
        fontWeight: "600" as const,
      },
      emptyText: {
        color: theme.colors.foregroundMuted,
        textAlign: "center" as const,
        marginTop: 24,
      },
      refreshButton: { alignSelf: "flex-start" as const, paddingVertical: 4 },
      refreshText: { color: theme.colors.accent, fontSize: 13 },
    }),
    [theme, layout.compact]
  )

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
        installations={detailInstallations}
        inventoryAvailable={inventoryAvailable}
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
        onOpenGallery={() => setGalleryEntry(detailEntry)}
        onBack={() => setDetailEntry(null)}
      />
    )
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Paseo Cafe</Text>
      <Text style={styles.subtitle}>Browse and install Paseo plugins.</Text>
      <TextInput
        placeholder="Search plugins…"
        value={search}
        onChangeText={(value) => setSearch(value.slice(0, 200))}
        style={styles.searchInput}
        placeholderTextColor={theme.colors.foregroundMuted}
      />
      <SortRow
        options={SORT_OPTIONS}
        selected={sortMode}
        theme={theme}
        onSelect={setSortMode}
      />
      <StatusFilterRow
        options={statusOptions}
        selected={effectiveStatusFilter}
        theme={theme}
        onSelect={setStatusFilter}
      />

      <View style={styles.filtersBlock}>
        <FilterRow
          label="Category"
          options={allCategories}
          selected={categoryFilter}
          theme={theme}
          formatOption={(value) =>
            DIRECTORY_CATEGORY_LABELS[normalizeDirectoryCategory(value)]
          }
          onToggle={(value) =>
            setCategoryFilter((prev) =>
              toggle(prev, normalizeDirectoryCategory(value))
            )
          }
          onClear={() => setCategoryFilter(new Set())}
        />
        <FilterRow
          label="Platform"
          options={allPlatforms}
          selected={platformFilter}
          theme={theme}
          onToggle={(value) => setPlatformFilter((prev) => toggle(prev, value))}
          onClear={() => setPlatformFilter(new Set())}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Refresh Paseo Cafe catalog"
        disabled={
          settingsPending ||
          refreshMutation.isPending ||
          directoryQuery.isFetching
        }
        style={styles.refreshButton}
        onPress={() => refreshMutation.mutate()}
      >
        <Text style={styles.refreshText}>
          {refreshMutation.isPending || directoryQuery.isFetching
            ? "Refreshing…"
            : "Refresh"}
        </Text>
      </Pressable>
      {settingsPending ? (
        <Text style={styles.emptyText}>Loading Paseo Cafe settings…</Text>
      ) : null}
      {updateStatusQuery.isFetching ? (
        <Text style={styles.emptyText}>Checking for plugin updates…</Text>
      ) : null}
      {updateStatusQuery.isError ? (
        <Text accessibilityRole="alert" style={styles.emptyText}>
          Update status is unavailable: {updateStatusQuery.error.message}
        </Text>
      ) : null}
      {settings.status === "error" || settings.status === "invalid" ? (
        <Text accessibilityRole="alert" style={styles.emptyText}>
          Paseo Cafe settings need attention, so the default catalog is in use:{" "}
          {settings.error}
        </Text>
      ) : null}
      {directoryQuery.data?.installationError ? (
        <Text accessibilityRole="alert" style={styles.emptyText}>
          Couldn't check installed plugins:{" "}
          {directoryQuery.data.installationError}
        </Text>
      ) : null}
      {directoryQuery.isPending && !settingsPending ? (
        <Text style={styles.emptyText}>Loading plugins…</Text>
      ) : null}
      {directoryQuery.isError ? (
        <Text accessibilityRole="alert" style={styles.emptyText}>
          Couldn't reach Paseo Cafe: {directoryQuery.error.message}
        </Text>
      ) : null}
      {directoryQuery.data ? (
        <Text style={styles.emptyText}>
          Catalog generated {directoryQuery.data.fetchedAt.slice(0, 10)}.
        </Text>
      ) : null}
      {directoryQuery.isSuccess ? (
        <Text accessibilityLiveRegion="polite" style={styles.emptyText}>
          Showing {sorted.length} of {nonStatusFiltered.length} matching
          plugins.
        </Text>
      ) : null}
      {directoryQuery.isSuccess && sorted.length === 0 ? (
        <Text style={styles.emptyText}>
          No plugins match the current search and filters.
        </Text>
      ) : null}
      {defaultBrowseState &&
      (popularHighlights.length > 0 || recentHighlights.length > 0) ? (
        <View style={styles.featuredBlock}>
          {popularHighlights.length > 0 ? (
            <View style={styles.featuredSection}>
              <Text accessibilityRole="header" style={styles.featuredHeader}>
                Popular
              </Text>
              <View style={styles.featuredItems}>
                {popularHighlights.map((item) => (
                  <PluginRow
                    key={`popular-${item.id}`}
                    entry={item}
                    theme={theme}
                    installations={installationByEntryId.get(item.id) ?? []}
                    compact={layout.compact}
                    onPress={() => openPlugin(item)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          {recentHighlights.length > 0 ? (
            <View style={styles.featuredSection}>
              <Text accessibilityRole="header" style={styles.featuredHeader}>
                Recently updated
              </Text>
              <View style={styles.featuredItems}>
                {recentHighlights.map((item) => (
                  <PluginRow
                    key={`recent-${item.id}`}
                    entry={item}
                    theme={theme}
                    installations={installationByEntryId.get(item.id) ?? []}
                    compact={layout.compact}
                    onPress={() => openPlugin(item)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <FlatList<DirectoryEntry>
        data={sorted}
        keyExtractor={(entry: DirectoryEntry) => entry.id}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }: { item: DirectoryEntry }) => (
          <PluginRow
            entry={item}
            theme={theme}
            installations={installationByEntryId.get(item.id) ?? []}
            compact={layout.compact}
            onPress={() => openPlugin(item)}
          />
        )}
      />
    </View>
  )
}
