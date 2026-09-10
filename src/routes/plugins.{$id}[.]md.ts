import { createFileRoute } from "@tanstack/react-router"
import { renderPluginMarkdown } from "@/lib/agent-content"
import { getPlugin } from "@/lib/plugins-data"

export const Route = createFileRoute("/plugins/{$id}.md")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const plugin = getPlugin(params.id)
        if (!plugin) {
          return new Response("Plugin not found\n", {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        }
        return new Response(renderPluginMarkdown(plugin), {
          headers: {
            "Cache-Control": "public, max-age=300",
            "Content-Type": "text/markdown; charset=utf-8",
          },
        })
      },
    },
  },
})
