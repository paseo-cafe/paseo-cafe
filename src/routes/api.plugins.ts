import { createFileRoute } from "@tanstack/react-router"
import { listPlugins } from "@/lib/plugins-data"

/**
 * Public, read-only JSON view of the same directory data the site renders —
 * for external callers (currently the paseo.cafe Paseo plugin at plugin/,
 * see plugin/server/directory.ts) that want the listing without scraping
 * HTML. Same data as getPlugins()/data/plugins.json, just exposed over HTTP.
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
