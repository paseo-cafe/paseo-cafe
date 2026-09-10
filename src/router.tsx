import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { ROUTER_BASE_PATH } from "./lib/site"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    // Empty at the root; "/<repo>" when a fork serves this as a project site.
    basepath: ROUTER_BASE_PATH,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
