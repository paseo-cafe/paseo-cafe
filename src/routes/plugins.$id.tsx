import { IconArrowLeft } from "@tabler/icons-react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { MediaGallery } from "@/components/media-gallery"
import { PluginCaveatsAlert } from "@/components/plugin-caveats-alert"
import { PluginHeader } from "@/components/plugin-header"
import { PluginInstallSection } from "@/components/plugin-install-section"
import { PluginReadme } from "@/components/plugin-readme"
import { PluginSidebar } from "@/components/plugin-sidebar"
import { PluginTrustAlert } from "@/components/plugin-trust-alert"
import { HOME_SEARCH_DEFAULT } from "@/lib/catalog-search"
import { formatDateTime } from "@/lib/format-date"
import { serializePluginJsonLd } from "@/lib/json-ld"
import { getPlugin } from "@/lib/plugins-data"
import { seo } from "@/lib/seo"
import { SITE_URL } from "@/lib/site"

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
        loaderData.description || `${loaderData.name} — a paseo.sh plugin.`,
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
    <div className="flex flex-col gap-8">
      {/* Structured data for rich search results — schema.org SoftwareApplication built from this same plugin record. */}
      <script
        type="application/ld+json"
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD escapes script-closing markup before insertion. */
        dangerouslySetInnerHTML={{
          __html: serializePluginJsonLd(plugin),
        }}
      />
      <Link
        to="/"
        search={HOME_SEARCH_DEFAULT}
        className="flex w-fit items-center gap-1 text-foreground/60 text-sm hover:text-foreground"
      >
        <IconArrowLeft className="size-4" /> All plugins
      </Link>

      <PluginHeader plugin={plugin} />

      {plugin.scanError ? (
        <div className="rounded-none border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {plugin.scanError}
        </div>
      ) : null}

      <MediaGallery plugin={plugin} />

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          <PluginTrustAlert plugin={plugin} />
          <PluginCaveatsAlert plugin={plugin} />
          <PluginInstallSection plugin={plugin} />
          {plugin.readmeHtml ? <PluginReadme html={plugin.readmeHtml} /> : null}

          <p className="text-foreground/40 text-xs">
            Scanned {formatDateTime(plugin.scannedAt)} from {plugin.repo}
            {plugin.path ? `/${plugin.path}` : ""}.
          </p>
        </div>

        <PluginSidebar plugin={plugin} />
      </div>
    </div>
  )
}
