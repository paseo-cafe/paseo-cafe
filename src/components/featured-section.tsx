import { Link } from "@tanstack/react-router"
import { SectionHeader } from "@/components/section-header"
import type { PluginRecord } from "@/lib/plugin-schema"

export function FeaturedSection({
  title,
  description,
  plugins,
}: {
  title: string
  description: string
  plugins: PluginRecord[]
}) {
  if (plugins.length === 0) return null

  const headingId = `${title.toLowerCase().replaceAll(" ", "-")}-heading`

  return (
    <section className="flex flex-col gap-base" aria-labelledby={headingId}>
      <SectionHeader id={headingId} title={title} description={description} />
      <div className="grid gap-base sm:grid-cols-2">
        {plugins.map((plugin) => (
          <Link
            key={plugin.id}
            to="/plugins/$id"
            params={{ id: plugin.id }}
            className="surface-panel surface-interactive flex min-w-0 items-center justify-between gap-stack px-stack py-group"
          >
            <span className="type-label truncate">{plugin.name}</span>
            <span className="type-meta shrink-0 text-muted-foreground">
              {plugin.repo}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
