import { IconExternalLink } from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"
import { seo } from "@/lib/seo"
import { OFFICIAL_DIRECTORY_URL } from "@/lib/site"
import { SUBMIT_URL } from "../../plugin/shared/catalog"

export const Route = createFileRoute("/submit")({
  head: () =>
    seo({
      title: "Submissions have moved",
      description:
        "paseo.cafe no longer accepts plugin submissions. Submit to the official Paseo plugin registry.",
      path: "/submit",
    }),
  component: SubmitPage,
})

function SubmitPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="font-semibold text-3xl tracking-tight">
        Submissions have moved
      </h1>
      <p className="mt-3 max-w-2xl text-foreground/70">
        New Paseo plugins are listed through the official registry. Open the
        submission form, paste your GitHub repository or npm package, and pick
        the categories that fit. A reviewer takes it from there. Git-only
        plugins are accepted; npm is optional.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button render={<a href={SUBMIT_URL} />}>
          Submit on paseo.sh <IconExternalLink className="size-3.5" />
        </Button>
        <Button variant="outline" render={<a href={OFFICIAL_DIRECTORY_URL} />}>
          Browse paseo.sh/plugins
        </Button>
      </div>
    </div>
  )
}
