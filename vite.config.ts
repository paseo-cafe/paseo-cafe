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

const config = defineConfig({
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
          "/",
          "/submit",
          "/api/plugins",
          "/llms.txt",
          "/llms-full.txt",
          "/openapi.json",
          ...machineRoutes,
        ],
      },
    }),
    viteReact(),
  ],
})

export default config
