import { describe, expect, it } from "vitest"
import { directoryPluginSchema } from "@/lib/directory-api"
import { listPlugins } from "@/lib/plugins-data"
import { Route as PluginApiRoute } from "./api.plugin.{$id}[.]json"
import { Route as LlmsFullRoute } from "./llms-full[.]txt"
import { Route as LlmsRoute } from "./llms[.]txt"
import { Route as OpenApiRoute } from "./openapi[.]json"
import { Route as PluginMarkdownRoute } from "./plugins.{$id}[.]md"

function getHandler(route: {
  options: {
    server?: {
      handlers?: unknown
    }
  }
}) {
  const handlers = route.options.server?.handlers
  const handler =
    typeof handlers === "object" && handlers !== null && "GET" in handlers
      ? handlers.GET
      : undefined
  if (typeof handler !== "function")
    throw new Error("GET handler not registered")
  return handler
}

describe("machine-readable routes", () => {
  it("serves the compact and expanded generated indexes", async () => {
    const compactResponse = await getHandler(LlmsRoute)({} as never)
    const fullResponse = await getHandler(LlmsFullRoute)({} as never)

    expect(compactResponse.headers.get("Content-Type")).toBe(
      "text/plain; charset=utf-8"
    )
    expect(await compactResponse.text()).toContain("## Plugins")
    expect(await fullResponse.text()).toContain("## paseo-cafe")
  })

  it("serves one plugin as Markdown and JSON", async () => {
    const plugin = listPlugins()[0]
    if (!plugin) throw new Error("Expected generated plugin data")

    const markdownResponse = await getHandler(PluginMarkdownRoute)({
      params: { id: plugin.id },
    } as never)
    expect(markdownResponse.headers.get("Content-Type")).toBe(
      "text/markdown; charset=utf-8"
    )
    expect(await markdownResponse.text()).toContain(`# ${plugin.name}`)

    const apiResponse = await getHandler(PluginApiRoute)({
      params: { id: plugin.id },
    } as never)
    expect(apiResponse.status).toBe(200)
    expect(
      directoryPluginSchema.safeParse(await apiResponse.json()).success
    ).toBe(true)
  })

  it.each(["not-a-plugin", "constructor", "__proto__"])(
    "returns not-found responses for unknown plugin %s",
    async (id) => {
      const context = { params: { id } } as never
      const markdownResponse = await getHandler(PluginMarkdownRoute)(context)
      const apiResponse = await getHandler(PluginApiRoute)(context)

      expect(markdownResponse.status).toBe(404)
      expect(apiResponse.status).toBe(404)
    }
  )

  it("publishes an OpenAPI contract for both JSON endpoints", async () => {
    const response = await getHandler(OpenApiRoute)({} as never)
    const document = (await response.json()) as Record<string, unknown>
    const paths = document.paths as
      | Record<string, { get?: unknown }>
      | undefined
    const components = document.components as
      | { schemas?: Record<string, unknown> }
      | undefined

    expect(document.openapi).toBe("3.1.0")
    expect(paths?.["/api/plugins"]?.get).toBeDefined()
    expect(paths?.["/api/plugin/{id}.json"]?.get).toBeDefined()
    expect(components?.schemas?.Plugin).toBeDefined()

    const references = [
      ...JSON.stringify(document).matchAll(/"\$ref":"(#[^"]+)"/g),
    ].map((match) => match[1])
    for (const reference of references) {
      let resolved: unknown = document
      for (const segment of reference?.slice(2).split("/") ?? []) {
        resolved = (resolved as Record<string, unknown>)[segment]
      }
      expect(
        resolved,
        `Unresolved OpenAPI reference: ${reference}`
      ).toBeDefined()
    }
  })
})
