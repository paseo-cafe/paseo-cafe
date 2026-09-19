import { IconArrowRight, IconPalette } from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ThemePreview } from "@/components/theme-preview"
import { Badge } from "@/components/ui/badge"
import { HOME_SEARCH_DEFAULT } from "@/lib/catalog-search"
import { listPlugins } from "@/lib/plugins-data"
import { normalizeCategory } from "@/lib/registry-schema"
import { seo } from "@/lib/seo"

export const Route = createFileRoute("/themes")({
  loader: () =>
    listPlugins()
      .filter((plugin) =>
        plugin.categories.some(
          (category) => normalizeCategory(category) === "theme"
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name)),
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
    <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 pb-20 sm:px-6">
      <header className="grid gap-6 border-border border-b pb-10 md:grid-cols-[1fr_auto] md:items-end">
        <div className="max-w-3xl">
          <div className="mb-4 flex items-center gap-2 font-medium text-foreground/50 text-xs uppercase tracking-widest">
            <IconPalette className="size-4" /> Appearance plugins
          </div>
          <h1 className="font-semibold text-4xl tracking-tight sm:text-5xl">
            Choose the room before you enter it.
          </h1>
          <p className="mt-4 max-w-2xl text-foreground/65">
            Paseo themes recolor the app, panels, terminal, diffs, and syntax.
            These specimens use the exact seed colors each plugin contributes,
            so you can compare them before installing.
          </p>
          <Link
            to="/"
            search={{ ...HOME_SEARCH_DEFAULT, category: "theme" }}
            className="mt-4 inline-flex items-center gap-1 text-sm underline underline-offset-4"
          >
            See theme plugins in the main catalog{" "}
            <IconArrowRight className="size-4" />
          </Link>
        </div>
        <div className="border border-border bg-card px-4 py-3 text-right">
          <p className="font-semibold text-2xl tabular-nums">{previewCount}</p>
          <p className="text-foreground/50 text-xs uppercase tracking-wide">
            palettes · {plugins.length} plugins
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-8" aria-labelledby="themes-heading">
        <div>
          <h2
            id="themes-heading"
            className="font-medium text-lg tracking-tight"
          >
            Theme gallery
          </h2>
          <p className="text-foreground/50 text-sm">
            Each card is a small Paseo interface painted from the plugin&apos;s
            declared palette. The app derives additional status, diff, syntax,
            and terminal colors after installation.
          </p>
        </div>

        {plugins.map((plugin) => (
          <article key={plugin.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3 border-border border-b pb-2">
              <div>
                <h3 className="font-semibold text-xl tracking-tight">
                  {plugin.name}
                </h3>
                <p className="text-foreground/50 text-sm">
                  {plugin.description || plugin.repo}
                </p>
              </div>
              <Link
                to="/plugins/$id"
                params={{ id: plugin.id }}
                className="flex items-center gap-1 text-sm underline underline-offset-4"
              >
                Plugin details <IconArrowRight className="size-4" />
              </Link>
            </div>

            {plugin.themes?.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {plugin.themes.map((theme) => (
                  <Link
                    key={theme.id}
                    to="/plugins/$id"
                    params={{ id: plugin.id }}
                    className="group border border-border bg-card p-2 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <ThemePreview theme={theme} />
                    <div className="flex items-center justify-between gap-3 px-1 pt-3 pb-1">
                      <span className="truncate font-medium">{theme.name}</span>
                      <Badge variant="outline">{theme.appearance}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                to="/plugins/$id"
                params={{ id: plugin.id }}
                className="flex min-h-36 items-center justify-center border border-border border-dashed bg-muted/30 px-6 text-center text-foreground/55 text-sm"
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
