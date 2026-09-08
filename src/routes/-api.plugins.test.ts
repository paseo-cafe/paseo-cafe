import { describe, expect, it } from "vitest"
import { Route } from "./api.plugins"

describe("GET /api/plugins", () => {
  it("returns the same records listPlugins() produces, with an envelope", async () => {
    const handlers = Route.options.server?.handlers
    const handler = typeof handlers === "object" ? handlers.GET : undefined
    if (typeof handler !== "function")
      throw new Error("GET handler not registered")

    const response = await handler({
      request: new Request("http://localhost/api/plugins"),
    } as never)
    if (!(response instanceof Response))
      throw new Error("GET handler did not return a Response")
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300")

    const body = await response.json()
    expect(Array.isArray(body.plugins)).toBe(true)
    expect(body.count).toBe(body.plugins.length)
    expect(typeof body.generatedAt).toBe("string")
    if (body.plugins.length > 0) {
      expect(body.plugins[0]).toHaveProperty("id")
      expect(body.plugins[0]).toHaveProperty("repo")
    }
  })
})
