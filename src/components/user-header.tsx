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
    <div className="flex items-center gap-3">
      {owner ? (
        <img
          src={owner.avatarUrl}
          alt=""
          className="size-10 rounded-full ring-1 ring-foreground/10"
        />
      ) : (
        <IconBrandGithub className="size-10 text-foreground/40" />
      )}
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          {owner?.login ?? username}
        </h1>
        <p className="text-foreground/60 text-sm">
          {pluginCount} plugin{pluginCount === 1 ? "" : "s"} on paseo.cafe.
        </p>
      </div>
    </div>
  )
}
