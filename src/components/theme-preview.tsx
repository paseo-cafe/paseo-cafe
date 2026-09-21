import {
  CATALOG_THEME_COLOR_KEYS,
  CATALOG_THEME_COLOR_LABELS,
  type CatalogThemePreview,
  getCatalogThemeColor,
} from "../../plugin/shared/catalog"

export function ThemePreview({ theme }: { theme: CatalogThemePreview }) {
  const accent = getCatalogThemeColor(theme.colors, "accent")

  return (
    <div className="flex flex-col">
      <div
        aria-hidden="true"
        className="aspect-[16/10] overflow-hidden border"
        style={{
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.border,
          color: theme.colors.foreground,
        }}
      >
        <div className="flex h-full min-h-0">
          <div
            className="flex w-[28%] shrink-0 flex-col border-r p-[5%]"
            style={{
              backgroundColor: theme.colors.raised,
              borderColor: theme.colors.border,
            }}
          >
            <div className="mb-[18%] flex items-center gap-chip">
              <span className="size-2" style={{ backgroundColor: accent }} />
              <span
                className="h-1.5 w-3/5"
                style={{ backgroundColor: theme.colors.foreground }}
              />
            </div>
            {[72, 92, 58].map((width) => (
              <span
                key={width}
                className="mb-[12%] h-1"
                style={{
                  width: `${width}%`,
                  backgroundColor: theme.colors.mutedForeground,
                }}
              />
            ))}
            <div className="mt-auto flex gap-inline">
              {[
                ["accent", accent],
                ["ring", theme.colors.ring],
                ["foreground", theme.colors.foreground],
              ].map(([token, color]) => (
                <span
                  key={token}
                  className="size-2 border"
                  style={{
                    backgroundColor: color,
                    borderColor: theme.colors.border,
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-[7%] p-[6%]">
            <div
              className="w-[82%] border p-[5%]"
              style={{
                backgroundColor: theme.colors.raised,
                borderColor: theme.colors.border,
              }}
            >
              <span
                className="mb-[8%] block h-1.5 w-[38%]"
                style={{ backgroundColor: accent }}
              />
              <span
                className="mb-[5%] block h-1 w-full"
                style={{ backgroundColor: theme.colors.foreground }}
              />
              <span
                className="block h-1 w-3/4"
                style={{ backgroundColor: theme.colors.mutedForeground }}
              />
            </div>
            <div
              className="mt-auto flex items-center gap-[5%] border p-[4%]"
              style={{
                backgroundColor: theme.colors.control,
                borderColor: theme.colors.border,
                boxShadow: `0 0 0 1px ${theme.colors.ring}`,
              }}
            >
              <span
                className="h-1 flex-1"
                style={{ backgroundColor: theme.colors.mutedForeground }}
              />
              <span className="size-4" style={{ backgroundColor: accent }} />
            </div>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 border-border border-x border-b sm:grid-cols-4">
        {CATALOG_THEME_COLOR_KEYS.map((key) => {
          const color = getCatalogThemeColor(theme.colors, key)
          return (
            <div
              key={key}
              className="flex min-w-0 items-center gap-chip border-border border-r px-2 py-1.5 last:border-r-0"
            >
              <span
                className="size-2.5 shrink-0 border border-black/20"
                style={{ backgroundColor: color, forcedColorAdjust: "none" }}
              />
              <div className="min-w-0 leading-none">
                <dt className="truncate text-[9px] text-muted-foreground uppercase">
                  {CATALOG_THEME_COLOR_LABELS[key]}
                </dt>
                <dd className="truncate text-[10px] text-muted-foreground">
                  {theme.colors[key] ?? "inherited"}
                </dd>
              </div>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
