import { IconBrandGithub } from "@tabler/icons-react"
import type { PluginOwner } from "@/lib/plugin-schema"

export function UserHeader({
  username,
  owner,
  pluginCount,
}: {
  username: string
  owner?: PluginOwner
  pluginCount: number
}) {
  return (
    <div className="flex items-center gap-stack">
      {owner ? (
        <img
          src={owner.avatarUrl}
          alt=""
          className="size-10 rounded-full border border-border"
        />
      ) : (
        <IconBrandGithub className="size-10 text-muted-foreground" />
      )}
      <div>
        <h1 className="type-title">{owner?.login ?? username}</h1>
        <p className="type-body text-muted-foreground">
          {pluginCount} plugin{pluginCount === 1 ? "" : "s"} on paseo.cafe.
        </p>
      </div>
    </div>
  )
}
