import { IconArrowLeft } from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { PluginGrid } from "@/components/plugin-grid"
import { UserHeader } from "@/components/user-header"
import { HOME_SEARCH_DEFAULT } from "@/lib/catalog-search"
import { listPluginsByOwner } from "@/lib/plugins-data"
import { seo } from "@/lib/seo"

export const Route = createFileRoute("/user/$username")({
  component: UserPluginsPage,
  loader: ({ params }) => ({
    username: params.username,
    plugins: listPluginsByOwner(params.username),
  }),
  head: ({ loaderData }) =>
    loaderData
      ? seo({
          title: `Plugins by ${loaderData.username}`,
          description: `Paseo plugins published by ${loaderData.username}.`,
          path: `/user/${loaderData.username}`,
        })
      : {},
})

function UserPluginsPage() {
  const { username, plugins } = Route.useLoaderData()
  const owner = plugins[0]?.owner

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-10 pb-20">
      <Link
        to="/"
        search={HOME_SEARCH_DEFAULT}
        className="flex w-fit items-center gap-1 text-foreground/60 text-sm hover:text-foreground"
      >
        <IconArrowLeft className="size-4" /> All plugins
      </Link>

      <UserHeader
        username={username}
        owner={owner}
        pluginCount={plugins.length}
      />

      {plugins.length === 0 ? (
        <p className="py-12 text-center text-foreground/50 text-sm">
          No plugins found for this user yet.
        </p>
      ) : (
        <PluginGrid plugins={plugins} />
      )}
    </div>
  )
}
