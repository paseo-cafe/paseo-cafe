import { IconAlertTriangle } from "@tabler/icons-react"
import { createFileRoute, notFound } from "@tanstack/react-router"
import { BackLink } from "@/components/back-link"
import { MediaGallery } from "@/components/media-gallery"
import { PluginCaveatsAlert } from "@/components/plugin-caveats-alert"
import { PluginHeader } from "@/components/plugin-header"
import { PluginInstallSection } from "@/components/plugin-install-section"
import { PluginReadme } from "@/components/plugin-readme"
import { PluginSidebar } from "@/components/plugin-sidebar"
import { PluginTrustAlert } from "@/components/plugin-trust-alert"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatDateTime } from "@/lib/format-date"
import { serializePluginJsonLd } from "@/lib/json-ld"
import { getPlugin } from "@/lib/plugins-data"
import { seo } from "@/lib/seo"
import { SITE_URL } from "@/lib/site"
import { inlineMarkdownToPlainText } from "../../plugin/shared/inline-markdown"

export const Route = createFileRoute("/plugins/$id")({
  component: PluginDetail,
  loader: ({ params }) => {
    const plugin = getPlugin(params.id)
    if (!plugin) throw notFound()
    return plugin
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const metadata = seo({
      title: loaderData.name,
      description:
        // Search results and social cards show this as plain text.
        inlineMarkdownToPlainText(loaderData.descriptionNodes) ||
        `${loaderData.name} — a paseo.sh plugin.`,
      path: `/plugins/${loaderData.id}`,
      image: `/og/${loaderData.id}.png`,
      type: "article",
    })
    return {
      ...metadata,
      links: [
        ...metadata.links,
        {
          rel: "alternate",
          type: "text/markdown",
          href: `${SITE_URL}/plugins/${loaderData.id}.md`,
          title: `${loaderData.name} agent-readable listing`,
        },
        {
          rel: "describedby",
          type: "application/json",
          href: `${SITE_URL}/api/plugin/${loaderData.id}.json`,
          title: `${loaderData.name} JSON listing`,
        },
      ],
    }
  },
})

function PluginDetail() {
  const plugin = Route.useLoaderData()

  return (
    <div className="flex flex-col gap-section">
      {/* Structured data for rich search results — schema.org SoftwareApplication built from this same plugin record. */}
      <script
        type="application/ld+json"
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD escapes script-closing markup before insertion. */
        dangerouslySetInnerHTML={{
          __html: serializePluginJsonLd(plugin),
        }}
      />
      <BackLink />

      <PluginHeader plugin={plugin} />

      {plugin.scanError ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertDescription>{plugin.scanError}</AlertDescription>
        </Alert>
      ) : null}

      <MediaGallery plugin={plugin} />

      <div className="flex flex-col gap-section lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-section">
          <PluginTrustAlert plugin={plugin} />
          <PluginCaveatsAlert plugin={plugin} />
          <PluginInstallSection plugin={plugin} />
          {plugin.readmeHtml ? <PluginReadme html={plugin.readmeHtml} /> : null}

          <p className="type-meta text-muted-foreground">
            Scanned {formatDateTime(plugin.scannedAt)} from {plugin.repo}
            {plugin.path ? `/${plugin.path}` : ""}.
          </p>
        </div>

        <PluginSidebar plugin={plugin} />
      </div>
    </div>
  )
}
