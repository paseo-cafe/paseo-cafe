import { createFileRoute } from "@tanstack/react-router"
import snapshot from "../../data/install-counts.json"

/**
 * Public copy of the generated aggregate snapshot. A later Pages build uses
 * the currently deployed copy when the Cafe service is temporarily unavailable.
 */
export const Route = createFileRoute("/api/install-counts")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(snapshot, {
          headers: { "Cache-Control": "public, max-age=300" },
        }),
    },
  },
})
