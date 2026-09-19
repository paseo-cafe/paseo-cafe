import { IconArrowRight } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import type { PluginRecord } from "@/lib/plugin-schema"

export function ThemeFeaturedSection({ plugins }: { plugins: PluginRecord[] }) {
  const previews = plugins
    .flatMap((plugin) =>
      (plugin.themes ?? []).map((theme) => ({ plugin, theme }))
    )
    .slice(0, 6)

  if (previews.length === 0) return null

  return (
    <section className="flex flex-col gap-3" aria-labelledby="themes-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="themes-heading"
            className="font-medium text-lg tracking-tight"
          >
            Themes
          </h2>
          <p className="text-foreground/50 text-sm">
            Compare exact contributed palettes before installing.
          </p>
        </div>
        <Link
          to="/themes"
          className="flex shrink-0 items-center gap-1 text-sm underline underline-offset-4"
        >
          View gallery <IconArrowRight className="size-4" />
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {previews.map(({ plugin, theme }) => (
          <Link
            key={`${plugin.id}-${theme.id}`}
            to="/plugins/$id"
            params={{ id: plugin.id }}
            className="flex min-w-0 items-center gap-3 border border-border bg-card p-2 transition-colors hover:bg-muted"
          >
            <span
              className="grid size-10 shrink-0 grid-cols-2 overflow-hidden border"
              style={{ borderColor: theme.colors.border }}
              aria-hidden="true"
            >
              {[
                ["background", theme.colors.background],
                ["raised", theme.colors.raised],
                ["control", theme.colors.control],
                ["accent", theme.colors.accent ?? theme.colors.foreground],
              ].map(([token, color]) => (
                <span key={token} style={{ backgroundColor: color }} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-sm">
                {theme.name}
              </span>
              <span className="block truncate text-foreground/50 text-xs">
                {plugin.name} · {theme.appearance}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
