import { readFile } from "node:fs/promises"
import plugins from "../data/plugins.json" with { type: "json" }
import {
  BASE_PATH,
  IS_CANONICAL_DEPLOYMENT,
  SITE_NAME,
  SITE_URL,
} from "../src/lib/site.ts"

const artifactRoot = ".output/public"
const verifyArtifactRoot = process.argv.includes("--artifact-root")
const publicDirectory = verifyArtifactRoot
  ? artifactRoot
  : `${artifactRoot}${BASE_PATH}`.replace(/\/$/, "")
const entrypoint = await readFile(
  `${publicDirectory}/index.html`,
  "utf8"
).catch(() => undefined)

if (
  !entrypoint?.includes(`<title>${SITE_NAME}</title>`) ||
  !entrypoint.includes("All plugins")
) {
  throw new Error(
    `GitHub Pages build must emit a rendered ${publicDirectory}/index.html catalog entrypoint`
  )
}
const [robots, sitemap, pluginsRedirect] = await Promise.all([
  readFile(`${artifactRoot}/robots.txt`, "utf8"),
  readFile(`${artifactRoot}/sitemap.xml`, "utf8"),
  readFile(`${artifactRoot}/plugins/index.html`, "utf8"),
])
const expectedHome = `${SITE_URL}/`
const deploymentFilesValid = IS_CANONICAL_DEPLOYMENT
  ? robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)
  : robots === "User-agent: *\nDisallow: /\n" &&
    entrypoint.includes('name="robots" content="noindex, nofollow"')

if (
  !deploymentFilesValid ||
  !sitemap.includes(`<loc>${expectedHome}</loc>`) ||
  !pluginsRedirect.includes(`content="0; url=${BASE_PATH}"`) ||
  !pluginsRedirect.includes(`rel="canonical" href="${expectedHome}"`)
) {
  throw new Error("GitHub Pages build has stale deployment-specific files")
}

if (!verifyArtifactRoot && BASE_PATH !== "/") {
  const hasUnprefixedIndex = await readFile(`${artifactRoot}/index`).then(
    () => true,
    () => false
  )
  if (hasUnprefixedIndex) {
    throw new Error("GitHub Pages build emitted an unprefixed root route")
  }
}

const llms = await readFile(`${publicDirectory}/llms.txt`, "utf8")
const llmsFull = await readFile(`${publicDirectory}/llms-full.txt`, "utf8")
const openApi = JSON.parse(
  await readFile(`${publicDirectory}/openapi.json`, "utf8")
) as { paths?: Record<string, unknown> }

if (
  !llms.includes(`${SITE_URL}/openapi.json`) ||
  !llmsFull.includes(`# ${SITE_NAME} plugin catalog`) ||
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
    !llms.includes(`${SITE_URL}/plugins/${plugin.id}.md`) ||
    !markdown.startsWith(`# ${plugin.name}\n`) ||
    apiPlugin.id !== plugin.id
  ) {
    throw new Error(
      `Generated machine-readable output is stale for ${plugin.id}`
    )
  }
}
