import { describe, expect, it } from "vitest"
import { installCountsSnapshotSchema } from "@/lib/install-counts"
import { Route } from "./api.install-counts"

describe("GET /api/install-counts", () => {
  it("publishes the generated aggregate snapshot for the next deployment", async () => {
    const handlers = Route.options.server?.handlers
    const handler = typeof handlers === "object" ? handlers.GET : undefined
    if (typeof handler !== "function") {
      throw new Error("GET handler not registered")
    }

    const response = await handler({
      request: new Request("http://localhost/api/install-counts"),
    } as never)
    if (!(response instanceof Response)) {
      throw new Error("GET handler did not return a Response")
    }

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300")
    expect(
      installCountsSnapshotSchema.parse(await response.json())
    ).toBeDefined()
  })
})
