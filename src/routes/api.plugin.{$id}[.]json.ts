import { createFileRoute } from "@tanstack/react-router"
import { projectPluginForDirectory } from "@/lib/directory-api"
import { getPlugin } from "@/lib/plugins-data"

export const Route = createFileRoute("/api/plugin/{$id}.json")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const plugin = getPlugin(params.id)
        if (!plugin) {
          return Response.json(
            { error: "Plugin not found" },
            { status: 404, headers: { "Cache-Control": "no-store" } }
          )
        }
        return Response.json(projectPluginForDirectory(plugin), {
          headers: { "Cache-Control": "public, max-age=300" },
        })
      },
    },
  },
})
