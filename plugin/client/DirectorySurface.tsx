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
  compareDirectoryAddedAt,
  DIRECTORY_ADDED_AT_LABEL,
  DIRECTORY_CATEGORIES,
  DIRECTORY_CATEGORY_LABELS,
  DIRECTORY_PLATFORM_LABELS,
  directoryBrowseSettingsEqual,
  directoryInstallRpc,
  directoryListRpc,
  directorySettings,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
  findInstallations,
  getInstallRef,
  isDefaultDirectoryBrowseView,
  isDirectoryAddedAtKnown,
  normalizeDirectoryCategories,
} from "../shared/directory"
import { filterAccessibilityLabel } from "./accessibility"
import { BrandMark } from "./BrandMark"
import { PluginDetailPage } from "./PluginDetailPage"
import { PluginGalleryPage } from "./PluginGalleryPage"
import { PluginRow } from "./PluginRow"
import { CAFE_CONTROL_RADIUS, CAFE_MONO_FONT } from "./visual"

const DIRECTORY_QUERY_KEY = "paseo-cafe-directory"
const UPDATE_STATUS_QUERY_KEY = "paseo-cafe-update-status"

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

interface FilterRowProps<T extends string> {
  label: string
  options: readonly T[]
  selected: ReadonlySet<T>
  theme: PluginTheme
  largeTouchTarget: boolean
  allCount?: number
  getCount?: (value: T) => number | undefined
  formatOption?: (value: T) => string
  onToggle: (value: T) => void
  onClear: () => void
}

function FilterRow<T extends string>({
  label,
  options,
  selected,
  theme,
  largeTouchTarget,
  allCount,
  getCount,
  formatOption,
  onToggle,
  onClear,
}: FilterRowProps<T>) {
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
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
        letterSpacing: 0.8,
      },
      chip: (active: boolean) => ({
        minHeight: largeTouchTarget ? 44 : 32,
        justifyContent: "center" as const,
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface0,
      }),
      chipText: (active: boolean) => ({
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        fontWeight: "600" as const,
        color: active
          ? theme.colors.accentForeground
          : theme.colors.foregroundMuted,
      }),
    }),
    [theme, largeTouchTarget]
  )

  if (options.length === 0) return null

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={filterAccessibilityLabel(
          "clear",
          label.toLowerCase(),
          allCount
        )}
        accessibilityState={{ selected: selected.size === 0 }}
        style={styles.chip(selected.size === 0)}
        onPress={onClear}
      >
        <Text style={styles.chipText(selected.size === 0)}>
          All{allCount === undefined ? "" : ` ${allCount}`}
        </Text>
      </Pressable>
      {options.map((option) => {
        const active = selected.has(option)
        const optionLabel = formatOption?.(option) ?? option
        const count = getCount?.(option)
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={filterAccessibilityLabel(
              "filter",
              optionLabel,
              count
            )}
            accessibilityState={{ selected: active }}
            style={styles.chip(active)}
            onPress={() => onToggle(option)}
          >
            <Text style={styles.chipText(active)}>
              {optionLabel}
              {getCount ? ` ${count ?? "—"}` : ""}
            </Text>
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
  largeTouchTarget,
  onSelect,
}: {
  options: readonly StatusFilterOption[]
  selected: InstallationStatusFilter
  theme: PluginTheme
  largeTouchTarget: boolean
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
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
        letterSpacing: 0.8,
      },
      chip: (active: boolean) => ({
        minHeight: largeTouchTarget ? 44 : 32,
        justifyContent: "center" as const,
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface0,
      }),
      chipText: (active: boolean) => ({
        color: active
          ? theme.colors.accentForeground
          : theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        fontWeight: "600" as const,
      }),
    }),
    [theme, largeTouchTarget]
  )

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Plugin installation status"
      style={styles.row}
    >
      <Text style={styles.label}>SHOW</Text>
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
  { value: "recently-added", label: DIRECTORY_ADDED_AT_LABEL },
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
      compareText(a.name, b.name) ||
      compareText(a.repo, b.repo) ||
      compareText(a.id, b.id)
    )
  }

  if (sortMode === "popular") {
    return (
      compareStarsDesc(a, b) ||
      compareText(a.name, b.name) ||
      compareText(a.repo, b.repo) ||
      compareText(a.id, b.id)
    )
  }

  // Newest catalog listings first, using the same rule as the website's
  // "Recently added" sort (see compareCatalogAddedAt in ../shared/catalog).
  if (sortMode === "recently-added") {
    return (
      compareDirectoryAddedAt(a, b) ||
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

function SortRow({
  options,
  selected,
  theme,
  largeTouchTarget,
  onSelect,
}: {
  options: readonly SortOption[]
  selected: SortMode
  theme: PluginTheme
  largeTouchTarget: boolean
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
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
        letterSpacing: 0.8,
      },
      chip: (active: boolean) => ({
        minHeight: largeTouchTarget ? 44 : 32,
        justifyContent: "center" as const,
        borderWidth: 1,
        borderColor: active ? theme.colors.accent : theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: active ? theme.colors.accent : theme.colors.surface0,
      }),
      chipText: (active: boolean) => ({
        color: active
          ? theme.colors.accentForeground
          : theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        fontWeight: "600" as const,
      }),
    }),
    [theme, largeTouchTarget]
  )

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Plugin sort order"
      style={styles.row}
    >
      <Text style={styles.label}>SORT</Text>
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
  const [galleryEntry, setGalleryEntry] = useState<DirectoryEntry | null>(null)
  const [lastOpenedPluginId, setLastOpenedPluginId] = useState<string | null>(
    null
  )
  const [settingsHydrated, setSettingsHydrated] = useState(false)
  const hasHydratedSettings = useRef(false)

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
      const ref = getInstallRef(entry.repoMeta?.defaultBranch)
      return installPlugin({
        repo: entry.repo,
        path: entry.path,
        ref,
        expectedCommit: ref ? entry.security?.commit : undefined,
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
        entry: {
          id: entry.id,
          repo: entry.repo,
          path: entry.path,
          version: entry.version,
          ref: entry.repoMeta?.defaultBranch,
        },
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
        categories: normalizeDirectoryCategories(entry.categories),
      })),
    [catalogPlugins]
  )
  const detailEntry = lastOpenedPluginId
    ? (plugins.find((entry) => entry.id === lastOpenedPluginId) ?? null)
    : null
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
    const present = new Set(plugins.flatMap((entry) => entry.categories))
    return DIRECTORY_CATEGORIES.filter((category) => present.has(category))
  }, [plugins])
  const allPlatforms = useMemo(
    (): string[] =>
      Array.from(
        new Set(plugins.flatMap((entry: DirectoryEntry) => entry.platforms))
      ).sort(),
    [plugins]
  )
  const categoryCounts = useMemo(
    (): Record<DirectoryCategory, number> =>
      Object.fromEntries(
        DIRECTORY_CATEGORIES.map((category) => [
          category,
          plugins.filter((entry) => entry.categories.includes(category)).length,
        ])
      ) as Record<DirectoryCategory, number>,
    [plugins]
  )
  const platformCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of plugins) {
      for (const platform of new Set(entry.platforms)) {
        counts.set(platform, (counts.get(platform) ?? 0) + 1)
      }
    }
    return counts
  }, [plugins])

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
          ...entry.categories.map(
            (category) => DIRECTORY_CATEGORY_LABELS[category]
          ),
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
        !entry.categories.some((category) => categoryFilter.has(category))
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
  // browseSettings already carries exactly the state this depends on.
  const defaultBrowseState = isDefaultDirectoryBrowseView(browseSettings)

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
  // Entries with no usable listing date are left out entirely: a catalog that
  // doesn't publish valid addedAt values shows no section rather than an
  // arbitrary five.
  const recentlyAddedHighlights = useMemo(
    () =>
      defaultBrowseState
        ? sortEntries(
            filtered.filter(isDirectoryAddedAtKnown),
            "recently-added",
            installationByEntryId
          ).slice(0, FEATURED_LIMIT)
        : [],
    [defaultBrowseState, filtered, installationByEntryId]
  )

  function openPlugin(entry: DirectoryEntry) {
    setLastOpenedPluginId(entry.id)
  }

  const selectedSortLabel =
    SORT_OPTIONS.find((option) => option.value === sortMode)?.label ?? sortMode

  const styles = useMemo(
    () => ({
      screen: {
        flex: 1,
        padding: layout.compact ? 16 : 24,
        backgroundColor: theme.colors.surface0,
      },
      listContent: {
        width: "100%" as const,
        maxWidth: 1120,
        alignSelf: "center" as const,
        gap: 16,
        paddingBottom: 32,
      },
      listHeader: { gap: layout.compact ? 16 : 24 },
      masthead: { gap: 8, paddingVertical: layout.compact ? 4 : 8 },
      // Mirrors the website header: mark in the foreground color next to a
      // semibold, tightly tracked wordmark.
      brandRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 8,
        marginBottom: 4,
      },
      brandName: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 14,
        fontWeight: "600" as const,
        letterSpacing: -0.3,
      },
      eyebrowRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 7,
      },
      eyebrowDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: theme.colors.accent,
      },
      eyebrow: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
        letterSpacing: 0.7,
      },
      title: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: layout.compact ? 26 : 34,
        fontWeight: "700" as const,
        letterSpacing: -1,
      },
      subtitle: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        lineHeight: 20,
        maxWidth: 680,
      },
      filterPanel: {
        gap: 10,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: 12,
        backgroundColor: theme.colors.surface1,
      },
      searchInput: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface0,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
      },
      filtersBlock: { gap: 8 },
      refreshButton: {
        alignSelf: "flex-start" as const,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: theme.colors.surface0,
      },
      refreshText: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        fontWeight: "600" as const,
      },
      feedbackText: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        lineHeight: 18,
      },
      catalogSummary: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
      },
      featuredBlock: { gap: 28 },
      featuredSection: { gap: 10 },
      sectionHeading: { gap: 2 },
      featuredItems: { gap: 8 },
      featuredHeader: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 17,
        fontWeight: "600" as const,
        letterSpacing: -0.3,
      },
      featuredDescription: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
      },
      resultsHeader: { gap: 2, marginTop: 8 },
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
        onBack={() => {
          setLastOpenedPluginId(null)
        }}
      />
    )
  }

  return (
    <View style={styles.screen}>
      <FlatList<DirectoryEntry>
        data={sorted}
        keyExtractor={(entry: DirectoryEntry) => entry.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.masthead}>
              <View style={styles.brandRow}>
                <BrandMark size={22} color={theme.colors.foreground} />
                <Text style={styles.brandName}>paseo.cafe</Text>
              </View>
              <View style={styles.eyebrowRow}>
                <View style={styles.eyebrowDot} />
                <Text style={styles.eyebrow}>
                  COMMUNITY-RUN UNOFFICIAL DIRECTORY
                </Text>
              </View>
              <Text accessibilityRole="header" style={styles.title}>
                A directory of paseo.sh plugins
              </Text>
              <Text style={styles.subtitle}>
                Browse community-built Paseo plugins. Every listing comes
                straight from its source repository.
              </Text>
            </View>

            <View style={styles.filterPanel}>
              <TextInput
                accessibilityLabel="Search Paseo plugins"
                placeholder="Search name, repo, owner…"
                value={search}
                onChangeText={(value) => setSearch(value.slice(0, 200))}
                style={styles.searchInput}
                placeholderTextColor={theme.colors.foregroundMuted}
              />
              <SortRow
                options={SORT_OPTIONS}
                selected={sortMode}
                theme={theme}
                largeTouchTarget={layout.compact || layout.platform !== "web"}
                onSelect={setSortMode}
              />
              <StatusFilterRow
                options={statusOptions}
                selected={effectiveStatusFilter}
                theme={theme}
                largeTouchTarget={layout.compact || layout.platform !== "web"}
                onSelect={setStatusFilter}
              />
              <View style={styles.filtersBlock}>
                <FilterRow
                  label="Categories"
                  allCount={plugins.length}
                  getCount={(category) => categoryCounts[category]}
                  options={allCategories}
                  selected={categoryFilter}
                  theme={theme}
                  largeTouchTarget={layout.compact || layout.platform !== "web"}
                  formatOption={(category) =>
                    DIRECTORY_CATEGORY_LABELS[category]
                  }
                  onToggle={(category) =>
                    setCategoryFilter((prev) => toggle(prev, category))
                  }
                  onClear={() => setCategoryFilter(new Set())}
                />
                <FilterRow
                  label="Platforms"
                  allCount={plugins.length}
                  getCount={(platform) => platformCounts.get(platform)}
                  options={allPlatforms}
                  selected={platformFilter}
                  theme={theme}
                  largeTouchTarget={layout.compact || layout.platform !== "web"}
                  formatOption={(platform) =>
                    DIRECTORY_PLATFORM_LABELS[
                      platform as keyof typeof DIRECTORY_PLATFORM_LABELS
                    ] ?? platform
                  }
                  onToggle={(value) =>
                    setPlatformFilter((prev) => toggle(prev, value))
                  }
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
                style={[
                  styles.refreshButton,
                  settingsPending ||
                  refreshMutation.isPending ||
                  directoryQuery.isFetching
                    ? { opacity: 0.5 }
                    : null,
                ]}
                onPress={() => refreshMutation.mutate()}
              >
                <Text style={styles.refreshText}>
                  {refreshMutation.isPending || directoryQuery.isFetching
                    ? "Refreshing…"
                    : "Refresh catalog"}
                </Text>
              </Pressable>
            </View>

            {settingsPending ? (
              <Text style={styles.feedbackText}>Loading Cafe settings…</Text>
            ) : null}
            {updateStatusQuery.isFetching ? (
              <Text style={styles.feedbackText}>
                Checking for plugin updates…
              </Text>
            ) : null}
            {updateStatusQuery.isError ? (
              <Text accessibilityRole="alert" style={styles.feedbackText}>
                Update status is unavailable: {updateStatusQuery.error.message}
              </Text>
            ) : null}
            {settings.status === "error" || settings.status === "invalid" ? (
              <Text accessibilityRole="alert" style={styles.feedbackText}>
                Cafe settings need attention, so the default catalog is in use:{" "}
                {settings.error}
              </Text>
            ) : null}
            {directoryQuery.data?.installationError ? (
              <Text accessibilityRole="alert" style={styles.feedbackText}>
                Couldn't check installed plugins:{" "}
                {directoryQuery.data.installationError}
              </Text>
            ) : null}
            {directoryQuery.isPending && !settingsPending ? (
              <Text style={styles.feedbackText}>Loading plugins…</Text>
            ) : null}
            {directoryQuery.isError ? (
              <Text accessibilityRole="alert" style={styles.feedbackText}>
                Couldn't reach Paseo Cafe: {directoryQuery.error.message}
              </Text>
            ) : null}
            {directoryQuery.data && directoryQuery.isSuccess ? (
              <Text
                accessibilityLiveRegion="polite"
                style={styles.catalogSummary}
              >
                Catalog generated {directoryQuery.data.fetchedAt.slice(0, 10)} ·
                Showing {sorted.length} of {nonStatusFiltered.length} matching
                plugins.
              </Text>
            ) : null}
            {directoryQuery.isSuccess && sorted.length === 0 ? (
              <Text style={styles.feedbackText}>
                No plugins match the current search and filters.
              </Text>
            ) : null}
            {defaultBrowseState &&
            (popularHighlights.length > 0 ||
              recentlyAddedHighlights.length > 0) ? (
              <View style={styles.featuredBlock}>
                {popularHighlights.length > 0 ? (
                  <View style={styles.featuredSection}>
                    <View style={styles.sectionHeading}>
                      <Text
                        accessibilityRole="header"
                        style={styles.featuredHeader}
                      >
                        Popular
                      </Text>
                      <Text style={styles.featuredDescription}>
                        Most starred plugins right now.
                      </Text>
                    </View>
                    <View style={styles.featuredItems}>
                      {popularHighlights.map((item) => (
                        <PluginRow
                          key={`popular-${item.id}`}
                          entry={item}
                          theme={theme}
                          installations={
                            installationByEntryId.get(item.id) ?? []
                          }
                          compact={layout.compact}
                          onPress={() => openPlugin(item)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
                {recentlyAddedHighlights.length > 0 ? (
                  <View style={styles.featuredSection}>
                    <View style={styles.sectionHeading}>
                      <Text
                        accessibilityRole="header"
                        style={styles.featuredHeader}
                      >
                        {DIRECTORY_ADDED_AT_LABEL}
                      </Text>
                      <Text style={styles.featuredDescription}>
                        The newest listings in the directory.
                      </Text>
                    </View>
                    <View style={styles.featuredItems}>
                      {recentlyAddedHighlights.map((item) => (
                        <PluginRow
                          key={`recently-added-${item.id}`}
                          showAddedDate
                          entry={item}
                          theme={theme}
                          installations={
                            installationByEntryId.get(item.id) ?? []
                          }
                          compact={layout.compact}
                          onPress={() => openPlugin(item)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
            {directoryQuery.isSuccess && sorted.length > 0 ? (
              <View style={styles.resultsHeader}>
                <Text accessibilityRole="header" style={styles.featuredHeader}>
                  All plugins
                </Text>
                <Text style={styles.featuredDescription}>
                  Sorted by {selectedSortLabel.toLowerCase()}.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }: { item: DirectoryEntry }) => (
          <PluginRow
            entry={item}
            theme={theme}
            installations={installationByEntryId.get(item.id) ?? []}
            compact={layout.compact}
            showAddedDate={sortMode === "recently-added"}
            onPress={() => openPlugin(item)}
          />
        )}
      />
    </View>
  )
}
