import { createFileRoute, redirect } from "@tanstack/react-router"

// The listing now lives on the home route ("/") — this just keeps
// bookmarked/external links to /plugins working.
export const Route = createFileRoute("/plugins/")({
  beforeLoad: () => {
    throw redirect({ to: "/" })
  },
})
