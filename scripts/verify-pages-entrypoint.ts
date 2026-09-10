import { readFile } from "node:fs/promises"
import plugins from "../data/plugins.json" with { type: "json" }

const publicDirectory = ".output/public"
const entrypoint = await readFile(
  `${publicDirectory}/index.html`,
  "utf8"
).catch(() => undefined)

if (
  !entrypoint?.includes("<title>paseo.cafe</title>") ||
  !entrypoint.includes("All plugins")
) {
  throw new Error(
    "GitHub Pages build must emit a rendered .output/public/index.html catalog entrypoint"
  )
}

const llms = await readFile(`${publicDirectory}/llms.txt`, "utf8")
const llmsFull = await readFile(`${publicDirectory}/llms-full.txt`, "utf8")
const openApi = JSON.parse(
  await readFile(`${publicDirectory}/openapi.json`, "utf8")
) as { paths?: Record<string, unknown> }

if (
  !llms.includes("https://paseo.cafe/openapi.json") ||
  !llmsFull.includes("# paseo.cafe plugin catalog") ||
  !openApi.paths?.["/api/plugins"] ||
  !openApi.paths["/api/plugin/{id}.json"]
) {
  throw new Error("GitHub Pages build must emit catalog discovery artifacts")
}

for (const plugin of plugins) {
  const markdownPath = `${publicDirectory}/plugins/${plugin.id}.md`
  const apiPath = `${publicDirectory}/api/plugin/${plugin.id}.json`
  const [markdown, apiText] = await Promise.all([
    readFile(markdownPath, "utf8"),
    readFile(apiPath, "utf8"),
  ])
  const apiPlugin = JSON.parse(apiText) as { id?: string }
  if (
    !llms.includes(`https://paseo.cafe/plugins/${plugin.id}.md`) ||
    !markdown.startsWith(`# ${plugin.name}\n`) ||
    apiPlugin.id !== plugin.id
  ) {
    throw new Error(
      `Generated machine-readable output is stale for ${plugin.id}`
    )
  }
}
