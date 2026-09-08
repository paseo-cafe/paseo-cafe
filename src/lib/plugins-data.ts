import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import type { PluginRecord } from "@/lib/plugin-schema"
import { pluginRecordSchema } from "@/lib/plugin-schema"
import plugins from "../../data/plugins.json"

// Statically imported rather than read off disk at request time: the CI
// pipeline (scan -> verify -> deploy, see .github/workflows/enrich-and-deploy.yml)
// always regenerates data/plugins.json *before* the app is built, so Vite/Nitro
// inline it straight into the server bundle at build time. That also makes the
// Zerops deploy self-contained — .output/ doesn't need the repo's data/
// directory alongside it at runtime, just this one bundled server file.
//
// Plain function, not a createServerFn: it's the shared business logic behind
// both the RPC below (used by route loaders) and the /api/plugins server
// route (src/routes/api.plugins.ts, used by external callers like the Paseo
// plugin at plugin/). Route loaders should call getPlugins() directly rather
// than fetch("/api/plugins") — see the server-routes skill's "Sharing Data
// with a Start Route" note.
export function listPlugins(): PluginRecord[] {
  return z.array(pluginRecordSchema).parse(plugins)
}

// createServerFn still keeps this out of the client bundle: only its RPC
// result crosses the wire, not the JSON module itself.
export const getPlugins = createServerFn({ method: "GET" }).handler(
  async (): Promise<PluginRecord[]> => {
    return listPlugins()
  }
)
