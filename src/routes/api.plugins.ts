import { createFileRoute } from "@tanstack/react-router"
import { listPlugins } from "@/lib/plugins-data"

/**
 * Public, read-only JSON view of the same directory data the site renders.
 * Nitro evaluates this handler while prerendering and publishes the response
 * as the static /api/plugins asset consumed by the companion Paseo plugin.
 */
export const Route = createFileRoute("/api/plugins")({
  server: {
    handlers: {
      GET: async () => {
        const plugins = listPlugins()
        return Response.json(
          {
            plugins,
            count: plugins.length,
            generatedAt: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "public, max-age=300" } }
        )
      },
    },
  },
})
