import { IconArrowRight, IconPalette } from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { PluginPopularity } from "@/components/plugin-card"
import { SectionHeader } from "@/components/section-header"
import { ThemePreview } from "@/components/theme-preview"
import { Badge } from "@/components/ui/badge"
import { HOME_SEARCH_DEFAULT, sortPlugins } from "@/lib/catalog-search"
import { listPlugins } from "@/lib/plugins-data"
import { normalizeCategory } from "@/lib/registry-schema"
import { seo } from "@/lib/seo"

export const Route = createFileRoute("/themes")({
  loader: () =>
    sortPlugins(
      listPlugins().filter((plugin) =>
        plugin.categories.some(
          (category) => normalizeCategory(category) === "theme"
        )
      ),
      "popular"
    ),
  head: () =>
    seo({
      title: "Themes",
      description:
        "Preview community-built Paseo themes from their exact contributed color palettes before installing them.",
      path: "/themes",
    }),
  component: ThemesPage,
})

function ThemesPage() {
  const plugins = Route.useLoaderData()
  const previewCount = plugins.reduce(
    (total, plugin) => total + (plugin.themes?.length ?? 0),
    0
  )

  return (
    <main className="page-body">
      <header className="grid gap-section border-border border-b pb-section md:grid-cols-[1fr_auto] md:items-end">
        <div className="flex max-w-3xl flex-col gap-base">
          <div className="type-eyebrow flex items-center gap-group text-muted-foreground">
            <IconPalette /> Appearance plugins
          </div>
          <h1 className="type-display">Choose the room before you enter it.</h1>
          <p className="type-lead max-w-2xl text-muted-foreground">
            Paseo themes recolor the app, panels, terminal, diffs, and syntax.
            These specimens use the exact seed colors each plugin contributes,
            so you can compare them before installing.
          </p>
          <Link
            to="/"
            search={{ ...HOME_SEARCH_DEFAULT, category: "theme" }}
            className="type-body inline-flex items-center gap-inline underline underline-offset-4"
          >
            See theme plugins in the main catalog <IconArrowRight />
          </Link>
        </div>
        <div className="surface-panel flex flex-col gap-inline px-base py-stack text-right">
          <p className="type-title tabular-nums">{previewCount}</p>
          <p className="type-eyebrow text-muted-foreground">
            palettes · {plugins.length} plugins
          </p>
        </div>
      </header>

      <section
        className="flex flex-col gap-section"
        aria-labelledby="themes-heading"
      >
        <SectionHeader
          id="themes-heading"
          title="Theme gallery"
          description="Each card is a small Paseo interface painted from the plugin's declared palette. Theme plugins are ranked by npm downloads, then GitHub stars, using the same popularity order as the main catalog."
        />

        {plugins.map((plugin) => (
          <article key={plugin.id} className="flex flex-col gap-base">
            <SectionHeader
              as="h3"
              title={plugin.name}
              description={plugin.description || plugin.repo}
              className="flex-wrap border-border border-b pb-group"
              action={
                <div className="flex items-center gap-base">
                  <PluginPopularity plugin={plugin} />
                  <Link
                    to="/plugins/$id"
                    params={{ id: plugin.id }}
                    className="type-body flex items-center gap-inline underline underline-offset-4"
                  >
                    Plugin details <IconArrowRight />
                  </Link>
                </div>
              }
            />

            {plugin.themes?.length ? (
              <div className="grid gap-base sm:grid-cols-2 lg:grid-cols-3">
                {plugin.themes.map((theme) => (
                  <Link
                    key={theme.id}
                    to="/plugins/$id"
                    params={{ id: plugin.id }}
                    className="group surface-panel surface-interactive p-group focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <ThemePreview theme={theme} />
                    <div className="flex items-center justify-between gap-stack px-inline pt-stack pb-inline">
                      <span className="type-label truncate">{theme.name}</span>
                      <Badge variant="outline">{theme.appearance}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                to="/plugins/$id"
                params={{ id: plugin.id }}
                className="empty-state surface-interactive"
              >
                No static palette preview is available. Open the listing to
                inspect screenshots and details.
              </Link>
            )}
          </article>
        ))}
      </section>
    </main>
  )
}
