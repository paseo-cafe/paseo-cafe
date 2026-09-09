import type { PluginTheme } from "@getpaseo/plugin"
import type { PluginSurfaceProps } from "@getpaseo/plugin/client"
import { useRpc, useSettings } from "@getpaseo/plugin/client"
import {
  FlatList,
  TextInput,
  useToast,
} from "@getpaseo/plugin/client/react-native"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Pressable, Text, View } from "react-native"
import type { DirectoryEntry } from "../shared/directory"
import {
  directoryInstallRpc,
  directoryListRpc,
  directorySettings,
} from "../shared/directory"
import { PluginDetailPage } from "./PluginDetailPage"
import { PluginGalleryPage } from "./PluginGalleryPage"
import { PluginRow } from "./PluginRow"

const DIRECTORY_QUERY_KEY = "paseo-cafe-directory"

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
  onToggle: (value: string) => void
  onClear: () => void
}

function FilterRow({
  label,
  options,
  selected,
  theme,
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
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityLabel={`Filter by ${option}`}
            accessibilityState={{ selected: active }}
            style={styles.chip(active)}
            onPress={() => onToggle(option)}
          >
            <Text style={styles.chipText(active)}>{option}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export function DirectorySurface({ theme, layout }: PluginSurfaceProps) {
  const listDirectory = useRpc(directoryListRpc)
  const installPlugin = useRpc(directoryInstallRpc)
  const settings = useSettings(directorySettings)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [platformFilter, setPlatformFilter] = useState<ReadonlySet<string>>(
    new Set()
  )
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installFailure, setInstallFailure] = useState<{
    entryId: string
    message: string
  } | null>(null)
  const [detailEntry, setDetailEntry] = useState<DirectoryEntry | null>(null)
  const [galleryEntry, setGalleryEntry] = useState<DirectoryEntry | null>(null)

  // Undefined until settings are readable: the handler then falls back to
  // PASEO_CAFE_DIRECTORY_URL or the default catalog, so an unreadable or
  // invalid settings document still shows a catalog instead of a blank surface.
  const baseUrl =
    settings.status === "ready" ? settings.values.directoryUrl : undefined
  const settingsPending = settings.status === "loading"
  const queryKey = [DIRECTORY_QUERY_KEY, baseUrl]

  const directoryQuery = useQuery({
    queryKey,
    queryFn: () => listDirectory({ baseUrl, force: false }),
    // Only the first read is gated, so the default catalog is never fetched
    // and then immediately replaced by the configured one.
    enabled: !settingsPending,
    staleTime: 60_000,
  })

  const installMutation = useMutation({
    mutationFn: (entry: DirectoryEntry) => {
      setInstallingId(entry.id)
      setInstallFailure(null)
      return installPlugin({ repo: entry.repo, path: entry.path })
    },
    onSuccess: (result, entry) => {
      if (result.ok) {
        setInstallFailure(null)
        toast.show(`Installed ${entry.name}`, { variant: "success" })
      } else {
        setInstallFailure({ entryId: entry.id, message: result.message })
        toast.error(`Couldn't install ${entry.name}. See details below.`)
      }
    },
    onError: (error, entry) => {
      const message = error instanceof Error ? error.message : "Install failed"
      setInstallFailure({ entryId: entry.id, message })
      toast.error(`Couldn't install ${entry.name}. See details below.`)
    },
    onSettled: () => setInstallingId(null),
  })

  const refreshMutation = useMutation({
    // The key travels with the request: switching the Catalog URL while a
    // refresh is in flight must not file the old catalog under the new key.
    mutationFn: async () => {
      const key = [DIRECTORY_QUERY_KEY, baseUrl]
      return { key, result: await listDirectory({ baseUrl, force: true }) }
    },
    onSuccess: ({ key, result }) => {
      queryClient.setQueryData(key, result)
      toast.show("Paseo Cafe refreshed.", { variant: "success" })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Refresh failed")
    },
  })

  const plugins = directoryQuery.data?.plugins ?? []

  const allCategories = useMemo(
    () =>
      Array.from(new Set(plugins.flatMap((entry) => entry.categories))).sort(),
    [plugins]
  )
  const allPlatforms = useMemo(
    () =>
      Array.from(new Set(plugins.flatMap((entry) => entry.platforms))).sort(),
    [plugins]
  )

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return plugins.filter((entry) => {
      if (query) {
        const haystack = [
          entry.name,
          entry.description,
          entry.repo,
          ...entry.categories,
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      if (
        categoryFilter.size > 0 &&
        !entry.categories.some((c) => categoryFilter.has(c))
      )
        return false
      if (
        platformFilter.size > 0 &&
        !entry.platforms.some((p) => platformFilter.has(p))
      )
        return false
      return true
    })
  }, [plugins, search, categoryFilter, platformFilter])

  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => (b.repoMeta?.stars ?? 0) - (a.repoMeta?.stars ?? 0)
      ),
    [filtered]
  )

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
        installing={installingId === detailEntry.id}
        installError={
          installFailure?.entryId === detailEntry.id
            ? installFailure.message
            : null
        }
        onInstall={() => installMutation.mutate(detailEntry)}
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
        onChangeText={setSearch}
        style={styles.searchInput}
        placeholderTextColor={theme.colors.foregroundMuted}
      />
      <View style={styles.filtersBlock}>
        <FilterRow
          label="Category"
          options={allCategories}
          selected={categoryFilter}
          theme={theme}
          onToggle={(value) => setCategoryFilter((prev) => toggle(prev, value))}
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
      {settings.status === "error" || settings.status === "invalid" ? (
        <Text accessibilityRole="alert" style={styles.emptyText}>
          Paseo Cafe settings need attention, so the default catalog is in use:{" "}
          {settings.error}
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
      {directoryQuery.isSuccess && sorted.length === 0 ? (
        <Text style={styles.emptyText}>
          No plugins match the current search and filters.
        </Text>
      ) : null}
      <FlatList
        data={sorted}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <PluginRow
            entry={item}
            theme={theme}
            compact={layout.compact}
            onPress={() => setDetailEntry(item)}
          />
        )}
      />
    </View>
  )
}
