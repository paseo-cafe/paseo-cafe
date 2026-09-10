import { createFileRoute } from "@tanstack/react-router"
import { renderLlmsTxt } from "@/lib/agent-content"
import { listPlugins } from "@/lib/plugins-data"

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(renderLlmsTxt(listPlugins()), {
          headers: {
            "Cache-Control": "public, max-age=300",
            "Content-Type": "text/plain; charset=utf-8",
          },
        }),
    },
  },
})
