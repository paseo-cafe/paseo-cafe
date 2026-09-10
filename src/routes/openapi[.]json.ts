import { createFileRoute } from "@tanstack/react-router"
import { createOpenApiDocument } from "@/lib/directory-api"

export const Route = createFileRoute("/openapi.json")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(createOpenApiDocument(), {
          headers: { "Cache-Control": "public, max-age=300" },
        }),
    },
  },
})
