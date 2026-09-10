import { createFileRoute } from "@tanstack/react-router"
import { renderLlmsFullTxt } from "@/lib/agent-content"
import { listPlugins } from "@/lib/plugins-data"

export const Route = createFileRoute("/llms-full.txt")({
  server: {
    handlers: {
      GET: async () =>
        new Response(renderLlmsFullTxt(listPlugins()), {
          headers: {
            "Cache-Control": "public, max-age=300",
            "Content-Type": "text/plain; charset=utf-8",
          },
        }),
    },
  },
})
