import { createFileRoute } from "@tanstack/react-router"
import { projectCatalogForDirectory } from "@/lib/directory-api"
import { listPlugins } from "@/lib/plugins-data"

/**
 * Public, read-only JSON view of the same directory data the site renders.
 * Nitro evaluates this handler while prerendering and publishes the response
 * as the static /api/plugins asset consumed by the companion Paseo plugin.
 */
export const Route = createFileRoute("/api/plugins")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(projectCatalogForDirectory(listPlugins()), {
          headers: { "Cache-Control": "public, max-age=300" },
        }),
    },
  },
})
