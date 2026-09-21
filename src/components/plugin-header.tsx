import { IconBrandGithub, IconVersions } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { InlineMarkdown } from "@/components/inline-markdown"
import { Badge } from "@/components/ui/badge"
import type { PluginRecord } from "@/lib/plugin-schema"
import { pluginOwnerLogin } from "@/lib/plugin-schema"
import { formatPluginVersion } from "@/lib/registry-schema"

export function PluginHeader({ plugin }: { plugin: PluginRecord }) {
  const username = pluginOwnerLogin(plugin)
  const versionLabel = formatPluginVersion(plugin.version)

  return (
    <div className="flex flex-col gap-stack">
      <div className="flex flex-wrap items-center gap-stack">
        <h1 className="type-title">{plugin.name}</h1>
        <Link
          to="/user/$username"
          params={{ username }}
          className="type-body inline-flex items-center gap-chip text-muted-foreground hover:text-foreground"
        >
          {plugin.owner ? (
            <img
              src={plugin.owner.avatarUrl}
              alt=""
              className="size-icon-md rounded-full border border-border"
            />
          ) : (
            <IconBrandGithub />
          )}
          by {username}
        </Link>
        {plugin.scanError ? (
          <Badge variant="destructive">needs attention</Badge>
        ) : null}
      </div>
      <p className="type-lead max-w-2xl text-muted-foreground">
        {plugin.descriptionNodes.length > 0 ? (
          <InlineMarkdown nodes={plugin.descriptionNodes} />
        ) : (
          "No description available."
        )}
      </p>
      {versionLabel || plugin.paseoVersionRequirement ? (
        <div className="flex flex-wrap gap-chip">
          {versionLabel ? (
            <Badge variant="outline">{versionLabel}</Badge>
          ) : null}
          {plugin.paseoVersionRequirement ? (
            <Badge variant="default">
              <IconVersions /> Requires Paseo {plugin.paseoVersionRequirement}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
