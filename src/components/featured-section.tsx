import { Link } from "@tanstack/react-router"
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

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
    >
      <div>
        <h2
          id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}
          className="font-medium text-lg tracking-tight"
        >
          {title}
        </h2>
        <p className="text-foreground/50 text-sm">{description}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {plugins.map((plugin) => (
          <Link
            key={plugin.id}
            to="/plugins/$id"
            params={{ id: plugin.id }}
            className="flex min-w-0 items-center justify-between gap-3 border border-border bg-card px-3 py-2 transition-colors hover:bg-muted"
          >
            <span className="truncate font-medium text-sm">{plugin.name}</span>
            <span className="shrink-0 text-foreground/50 text-xs">
              {plugin.repo}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
