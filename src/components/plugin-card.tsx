import {
  IconPhotoOff,
  IconPlayerPlayFilled,
  IconStar,
  IconVersions,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
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

export function PluginCard({ plugin }: { plugin: PluginRecord }) {
  const healthIsComplete =
    plugin.health.manifestValid &&
    plugin.health.hasReadme &&
    plugin.health.hasLicense &&
    plugin.health.hasTests &&
    plugin.health.hasTypecheckScript

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
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{plugin.name}</CardTitle>
            {plugin.repoMeta ? (
              <span className="flex shrink-0 items-center gap-1 text-foreground/50 text-xs">
                <IconStar className="size-3.5" />
                {plugin.repoMeta.stars}
              </span>
            ) : null}
          </div>
          <CardDescription className="line-clamp-2">
            {plugin.description || "No description available."}
          </CardDescription>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="sr-only">Freshness and health</span>
            {plugin.owner ? (
              <span className="flex items-center gap-1.5 text-foreground/50 text-xs">
                <img
                  src={plugin.owner.avatarUrl}
                  alt=""
                  className="size-4 rounded-full"
                />
                {plugin.owner.login}
              </span>
            ) : null}
            <Badge
              variant={plugin.health.updatedRecently ? "secondary" : "outline"}
            >
              {plugin.health.updatedRecently ? "Fresh" : "Stale"}
            </Badge>
            <Badge variant={healthIsComplete ? "secondary" : "outline"}>
              {healthIsComplete ? "Healthy" : "Incomplete health checks"}
            </Badge>
            {plugin.repoMeta?.archived ? (
              <Badge variant="destructive">Archived</Badge>
            ) : null}
          </div>
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
