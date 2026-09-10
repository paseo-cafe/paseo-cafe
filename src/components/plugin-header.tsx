import { IconBrandGithub, IconVersions } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { Badge } from "@/components/ui/badge"
import type { PluginRecord } from "@/lib/plugin-schema"
import { pluginOwnerLogin } from "@/lib/plugin-schema"

export function PluginHeader({ plugin }: { plugin: PluginRecord }) {
  const username = pluginOwnerLogin(plugin)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">{plugin.name}</h1>
        <Link
          to="/user/$username"
          params={{ username }}
          className="inline-flex items-center gap-1.5 text-foreground/60 text-sm hover:text-foreground"
        >
          {plugin.owner ? (
            <img
              src={plugin.owner.avatarUrl}
              alt=""
              className="size-5 rounded-full ring-1 ring-foreground/10"
            />
          ) : (
            <IconBrandGithub className="size-4" />
          )}
          by {username}
        </Link>
        {plugin.scanError ? (
          <Badge variant="destructive">needs attention</Badge>
        ) : null}
      </div>
      <p className="max-w-2xl text-foreground/70">
        {plugin.description || "No description available."}
      </p>
      {plugin.paseoVersionRequirement ? (
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="default">
            <IconVersions /> Requires Paseo {plugin.paseoVersionRequirement}
          </Badge>
        </div>
      ) : null}
    </div>
  )
}
