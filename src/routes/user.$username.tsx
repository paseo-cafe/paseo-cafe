import { createFileRoute } from "@tanstack/react-router"
import { BackLink } from "@/components/back-link"
import { PluginGrid } from "@/components/plugin-grid"
import { UserHeader } from "@/components/user-header"
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
    <div className="page-body">
      <BackLink />

      <UserHeader
        username={username}
        owner={owner}
        pluginCount={plugins.length}
      />

      {plugins.length === 0 ? (
        <p className="empty-state">No plugins found for this user yet.</p>
      ) : (
        <PluginGrid plugins={plugins} />
      )}
    </div>
  )
}
