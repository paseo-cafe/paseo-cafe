import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import plugins from "./data/plugins.json" with { type: "json" }

const machineRoutes = plugins.flatMap((plugin) => [
  `/api/plugin/${plugin.id}.json`,
  `/plugins/${plugin.id}.md`,
])

// configure-pages reports "/" or "/<repo>"; Vite wants a trailing slash.
const RAW_BASE = process.env.VITE_BASE_PATH || "/"
const BASE = RAW_BASE.endsWith("/") ? RAW_BASE : `${RAW_BASE}/`

const config = defineConfig({
  // Where the site is served from: "/" for the canonical custom domain, and
  // "/<repo>/" for a fork's GitHub Pages project site. The deploy workflow
  // fills this in from actions/configure-pages; see src/lib/site.ts.
  base: BASE,
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    tailwindcss(),
    tanstackStart(),
    // GitHub Pages serves only files. Nitro prerenders the linked catalog
    // pages and fixed routes into .output/public and fails the build if any
    // route cannot be rendered.
    nitro({
      preset: "github_pages",
      static: true,
      prerender: {
        crawlLinks: true,
        failOnError: true,
        ignore: ["/404.html"],
        routes: [
          BASE,
          `${BASE}submit`,
          `${BASE}api/plugins`,
          `${BASE}llms.txt`,
          `${BASE}llms-full.txt`,
          `${BASE}openapi.json`,
          ...machineRoutes.map((route) => `${BASE}${route.replace(/^\//, "")}`),
        ],
      },
    }),
    viteReact(),
  ],
})

export default config
