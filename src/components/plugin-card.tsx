import {
  IconPhotoOff,
  IconPlayerPlayFilled,
  IconRefresh,
  IconSparkles,
  IconStar,
  IconVersions,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { LocalDate } from "@/components/local-date"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { PluginRecord } from "@/lib/plugin-schema"
import { PLATFORM_LABELS } from "@/lib/registry-schema"

/** The date the listing is currently ordered by, so the ordering is legible on the card itself. */
function sortedDateNote(
  plugin: PluginRecord,
  showDate: "added" | "updated" | undefined
): { label: string; iso: string } | null {
  if (showDate === "added" && plugin.addedAt)
    return { label: "Added", iso: plugin.addedAt }
  if (showDate === "updated" && plugin.updatedAt)
    return { label: "Updated", iso: plugin.updatedAt }
  return null
}

/**
 * `isNew` and `isUpdated` mark what the directory gained, and what changed
 * version, since this visitor's previous visit (see src/lib/since-last-visit.ts).
 * Both are per-browser, so they only ever arrive from a client-side caller —
 * never from the record itself. `showDate` surfaces whichever date the grid is
 * sorted by, and is omitted for the orderings that aren't dates.
 */
export function PluginCard({
  plugin,
  isNew = false,
  isUpdated = false,
  showDate,
}: {
  plugin: PluginRecord
  isNew?: boolean
  isUpdated?: boolean
  showDate?: "added" | "updated"
}) {
  const dateNote = sortedDateNote(plugin, showDate)

  return (
    <Link to="/plugins/$id" params={{ id: plugin.id }} className="block">
      <Card className="h-full pt-0 transition-shadow hover:shadow-md">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden border-border border-b bg-muted">
          {plugin.images[0] ? (
            <img
              src={plugin.images[0]}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <IconPhotoOff className="size-6 text-foreground/20" />
            </div>
          )}
          {isNew ? (
            <Badge variant="default" className="absolute top-2 left-2 shadow">
              <IconSparkles /> new
            </Badge>
          ) : null}
          {isUpdated ? (
            <Badge variant="secondary" className="absolute top-2 left-2 shadow">
              <IconRefresh /> updated
            </Badge>
          ) : null}
          {plugin.videos.length > 0 ? (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/20"
              role="img"
              aria-label="Has a demo video"
            >
              <IconPlayerPlayFilled className="size-8 text-white drop-shadow" />
            </div>
          ) : null}
        </div>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{plugin.name}</CardTitle>
            {plugin.repoMeta ? (
              <span className="flex shrink-0 items-center gap-1 text-foreground/50 text-xs">
                <IconStar className="size-3.5" />
                {plugin.repoMeta.stars}
              </span>
            ) : null}
          </div>
          <CardDescription className="line-clamp-3">
            {plugin.description || "No description available."}
          </CardDescription>
          {plugin.owner ? (
            <div className="flex items-center gap-1.5 text-foreground/50 text-xs">
              <img
                src={plugin.owner.avatarUrl}
                alt=""
                className="size-4 rounded-full"
              />
              {plugin.owner.login}
            </div>
          ) : null}
          {dateNote ? (
            <span className="text-foreground/50 text-xs">
              {dateNote.label} <LocalDate iso={dateNote.iso} />
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {plugin.paseoVersionRequirement ? (
            <Badge variant="default">
              <IconVersions /> Paseo {plugin.paseoVersionRequirement}
            </Badge>
          ) : null}
          {plugin.platforms.map((p) => (
            <Badge key={p} variant="outline">
              {PLATFORM_LABELS[p]}
            </Badge>
          ))}
          {plugin.categories.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
          {plugin.scanError ? (
            <Badge variant="destructive">needs attention</Badge>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  )
}
