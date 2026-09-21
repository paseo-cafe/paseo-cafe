import { IconArrowRight } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { SectionHeader } from "@/components/section-header"
import type { PluginRecord } from "@/lib/plugin-schema"

export function ThemeFeaturedSection({ plugins }: { plugins: PluginRecord[] }) {
  const previews = plugins
    .flatMap((plugin) =>
      (plugin.themes ?? []).map((theme) => ({ plugin, theme }))
    )
    .slice(0, 6)

  if (previews.length === 0) return null

  return (
    <section
      className="flex flex-col gap-base"
      aria-labelledby="themes-heading"
    >
      <SectionHeader
        id="themes-heading"
        title="Themes"
        description="Compare exact contributed palettes before installing."
        action={
          <Link
            to="/themes"
            className="type-body flex shrink-0 items-center gap-inline underline underline-offset-4"
          >
            View gallery <IconArrowRight />
          </Link>
        }
      />
      <div className="grid gap-base sm:grid-cols-2">
        {previews.map(({ plugin, theme }) => (
          <Link
            key={`${plugin.id}-${theme.id}`}
            to="/plugins/$id"
            params={{ id: plugin.id }}
            className="surface-panel surface-interactive flex min-w-0 items-center gap-stack p-group"
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
              <span className="type-label block truncate">{theme.name}</span>
              <span className="type-meta block truncate text-muted-foreground">
                {plugin.name} · {theme.appearance}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
