import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBrandGithub,
  IconCheck,
  IconExternalLink,
  IconStar,
  IconVersions,
  IconX,
} from "@tabler/icons-react"
import { createFileRoute, Link, notFound } from "@tanstack/react-router"
import { CopyCommand } from "@/components/copy-command"
import { MediaGallery } from "@/components/media-gallery"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { formatDate, formatDateTime } from "@/lib/format-date"
import { getInstallCommand } from "@/lib/install-command"
import { serializePluginJsonLd } from "@/lib/json-ld"
import type { PluginHealth } from "@/lib/plugin-schema"
import { listPlugins } from "@/lib/plugins-data"
import { PLATFORM_LABELS } from "@/lib/registry-schema"
import { seo } from "@/lib/seo"
import { SITE_NAME, SITE_REPO } from "@/lib/site"

export const Route = createFileRoute("/plugins/$id")({
  component: PluginDetail,
  loader: ({ params }) => {
    const plugins = listPlugins()
    const plugin = plugins.find((p) => p.id === params.id)
    if (!plugin) throw notFound()
    return plugin
  },
  head: ({ loaderData }) =>
    loaderData
      ? seo({
          title: loaderData.name,
          description:
            loaderData.description || `${loaderData.name} — a paseo.sh plugin.`,
          path: `/plugins/${loaderData.id}`,
          image: `/og/${loaderData.id}.png`,
          type: "article",
        })
      : {},
})

const HEALTH_LABELS: Record<keyof PluginHealth, string> = {
  manifestValid: "Manifest ID matches registry",
  hasReadme: "Has a README",
  hasLicense: "Has a license",
  hasTests: "Has tests",
  hasTypecheckScript: "Has a typecheck script",
  updatedRecently: "Updated in the last 6 months",
}

function PluginDetail() {
  const plugin = Route.useLoaderData()
  // plugin.owner comes from the GitHub API and is authoritative when present;
  // repo.split("/")[0] is the same fallback used elsewhere on this page for
  // a scan that errored before repoMeta/owner got populated.
  const ownerLogin = plugin.owner?.login ?? plugin.repo.split("/")[0]
  const isOfficialListing =
    ownerLogin.toLowerCase() === SITE_REPO.split("/")[0].toLowerCase()

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
        className="flex w-fit items-center gap-1 text-foreground/60 text-sm hover:text-foreground"
      >
        <IconArrowLeft className="size-4" /> All plugins
      </Link>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-semibold text-3xl tracking-tight">
            {plugin.name}
          </h1>
          <a
            href={
              plugin.owner?.url ??
              `https://github.com/${plugin.repo.split("/")[0]}`
            }
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-foreground/60 text-sm hover:text-foreground"
          >
            {plugin.owner ? (
              <img
                src={plugin.owner.avatarUrl}
                alt=""
                className="size-5 rounded-full ring-1 ring-foreground/10"
              />
            ) : (
              <IconBrandGithub className="size-4" />
            )}
            by {plugin.owner?.login ?? plugin.repo.split("/")[0]}
          </a>
          {plugin.scanError ? (
            <Badge variant="destructive">needs attention</Badge>
          ) : null}
        </div>
        <p className="max-w-2xl text-foreground/70">
          {plugin.description || "No description available."}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {plugin.paseoVersionRequirement ? (
            <Badge variant="default">
              <IconVersions /> Requires Paseo {plugin.paseoVersionRequirement}
            </Badge>
          ) : null}
          {plugin.platforms.map((p) => (
            <Badge key={p} variant="outline">
              {PLATFORM_LABELS[p]}
            </Badge>
          ))}
          {plugin.categories.map((c) => (
            <Badge key={c} variant="secondary">
              {c}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-foreground/60 text-sm">
        {plugin.repoMeta ? (
          <span className="flex items-center gap-1">
            <IconStar className="size-4" /> {plugin.repoMeta.stars} stars
          </span>
        ) : null}
        {plugin.license ? <span>License: {plugin.license}</span> : null}
        {plugin.author ? <span>By {plugin.author}</span> : null}
        {plugin.repoMeta ? (
          <span>Last updated {formatDate(plugin.repoMeta.pushedAt)}</span>
        ) : null}
        <a
          href={plugin.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-foreground hover:underline"
        >
          <IconBrandGithub className="size-4" /> {plugin.repo}
          <IconExternalLink className="size-3.5" />
        </a>
      </div>
      {!isOfficialListing && (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>
            Community-submitted — not owned or vetted by {SITE_NAME}
          </AlertTitle>
          <AlertDescription>
            This listing is generated automatically from the plugin's own public
            repository. We don't audit, endorse, or take responsibility for
            third-party plugin code. Paseo plugins are trusted, unsandboxed code
            with filesystem, process, and network access on the machine they run
            on — read the source at{" "}
            <a href={plugin.url} target="_blank" rel="noreferrer">
              {plugin.repo}
            </a>{" "}
            before installing.
          </AlertDescription>
        </Alert>
      )}
      {plugin.paseoVersionRequirement ||
      plugin.platforms.length > 0 ||
      plugin.caveats.length > 0 ||
      plugin.limitationsNotesHtml ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Caveats</AlertTitle>
          <AlertDescription>
            {plugin.paseoVersionRequirement ? (
              <p>
                <strong className="text-foreground">Requires Paseo:</strong>{" "}
                {plugin.paseoVersionRequirement} — from this plugin's own
                paseo-plugin.json.
              </p>
            ) : null}
            {plugin.platforms.length > 0 ? (
              <p>
                <strong className="text-foreground">
                  Supported platforms:
                </strong>{" "}
                {plugin.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}.
              </p>
            ) : null}
            {plugin.caveats.length > 0 ? (
              <ul className="list-disc pl-4">
                {plugin.caveats.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
            {plugin.limitationsNotesHtml ? (
              <div>
                <p className="mb-1 text-xs uppercase tracking-wide">
                  From the plugin's README
                </p>
                {/* limitationsNotesHtml is sanitized at scan time (src/lib/markdown.ts) before
                    it's ever written to data/plugins.json — never render raw third-party
                    markdown here. */}
                <div
                  className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-none prose-pre:bg-muted"
                  /* biome-ignore lint/security/noDangerouslySetInnerHtml: The scan pipeline sanitizes this HTML with rehype-sanitize. */
                  dangerouslySetInnerHTML={{
                    __html: plugin.limitationsNotesHtml,
                  }}
                />
              </div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {plugin.scanError ? (
        <div className="rounded-none border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {plugin.scanError}
        </div>
      ) : null}

      <MediaGallery plugin={plugin} />

      <div>
        <h2 className="mb-2 font-medium text-foreground/60 text-sm">Install</h2>
        <CopyCommand command={getInstallCommand(plugin)} />
        {plugin.installNotesHtml ? (
          <div className="mt-3 border-border border-l-2 pl-4">
            <p className="mb-1 text-foreground/40 text-xs uppercase tracking-wide">
              From the plugin's README
            </p>
            {/* installNotesHtml is sanitized at scan time (src/lib/markdown.ts) before
                it's ever written to data/plugins.json — never render raw third-party
                markdown here. */}
            <div
              className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-none prose-pre:bg-muted font-mono text-foreground/70"
              /* biome-ignore lint/security/noDangerouslySetInnerHtml: The scan pipeline sanitizes this HTML with rehype-sanitize. */
              dangerouslySetInnerHTML={{ __html: plugin.installNotesHtml }}
            />
          </div>
        ) : null}
      </div>

      <Separator />

      <div>
        <h2 className="mb-3 font-medium text-foreground/60 text-sm">
          Health checks
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(HEALTH_LABELS) as (keyof PluginHealth)[]).map((key) => (
            <li key={key} className="flex items-center gap-2 text-sm">
              {plugin.health[key] ? (
                <IconCheck className="size-4 text-green-600" />
              ) : (
                <IconX className="size-4 text-foreground/30" />
              )}
              <span className={plugin.health[key] ? "" : "text-foreground/50"}>
                {HEALTH_LABELS[key]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-foreground/40 text-xs">
        Scanned {formatDateTime(plugin.scannedAt)} from {plugin.repo}
        {plugin.path ? `/${plugin.path}` : ""}.
      </p>
    </div>
  )
}
