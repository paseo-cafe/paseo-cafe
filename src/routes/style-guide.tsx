import {
  IconAlertTriangle,
  IconDownload,
  IconPhotoOff,
  IconPlayerPlayFilled,
} from "@tabler/icons-react"
import { createFileRoute } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { PluginCard } from "@/components/plugin-card"
import { SectionHeader } from "@/components/section-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listPlugins } from "@/lib/plugins-data"
import { SITE_NAME } from "@/lib/site"
import {
  ICON,
  type IconSize,
  SPACE,
  type SpaceRole,
  TYPE,
  type TypeRole,
} from "../../plugin/shared/design-tokens"

export const Route = createFileRoute("/style-guide")({
  loader: () => listPlugins()[0] ?? null,
  head: () => ({
    meta: [
      { title: `Style guide — ${SITE_NAME}` },
      {
        name: "description",
        content: "Design tokens and components shared by the site and plugin.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StyleGuide,
})

// Literal class names, so Tailwind's scanner sees every role it has to emit.
const TYPE_CLASS = {
  display: "type-display",
  title: "type-title",
  heading: "type-heading",
  subheading: "type-subheading",
  lead: "type-lead",
  body: "type-body",
  label: "type-label",
  meta: "type-meta",
  eyebrow: "type-eyebrow",
} as const satisfies Record<TypeRole, string>

const TYPE_USE = {
  display: "Hero h1 — home, themes",
  title: "Page h1 — plugin, submit, user, not found",
  heading: "Section h2",
  subheading: "h3 and callout titles",
  lead: "Intro paragraph under a title",
  body: "Default running text",
  label: "Card titles, row names, control labels",
  meta: "Descriptions, badges, footnotes",
  eyebrow: "Uppercase group labels",
} as const satisfies Record<TypeRole, string>

const ICON_CLASS = {
  sm: "size-icon-sm",
  md: "size-icon-md",
  lg: "size-icon-lg",
  xl: "size-icon-xl",
} as const satisfies Record<IconSize, string>

const SPACE_USE = {
  hair: "Vertical padding of a badge or chip",
  inline: "Icon ↔ text inside a badge, button, or link",
  chip: "Between chips, badges, and inline meta",
  group: "A label and what it labels; small-tile padding",
  stack: "Between sibling controls or tiles; compact-surface padding",
  base: "Surface padding; between blocks in a section",
  section: "Between page sections and page-level regions",
} as const satisfies Record<SpaceRole, string>

function Spec({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <section id={id} className="flex flex-col gap-base">
      <SectionHeader
        title={title}
        className="border-border border-b pb-group"
      />
      {children}
    </section>
  )
}

function StyleGuide() {
  const plugin = Route.useLoaderData()

  return (
    <main className="page-body">
      <header className="flex max-w-3xl flex-col gap-base">
        <p className="type-eyebrow text-muted-foreground">Design system</p>
        <h1 className="type-display">Style guide</h1>
        <p className="type-lead text-muted-foreground">
          One set of tokens drives the website and the Paseo companion plugin.
          They live in{" "}
          <code className="type-body">plugin/shared/design-tokens.ts</code>, and
          this page renders them straight from that file.
        </p>
        <ul className="type-body flex flex-col gap-group text-muted-foreground">
          <li>
            <strong className="text-foreground">Surfaces</strong> are a hairline
            border on a flat background. Layout containers — sidebars, columns,
            sections — are neither.
          </li>
          <li>
            <strong className="text-foreground">Text</strong> is foreground or
            muted. There is no third tier; hierarchy comes from the type role.
          </li>
          <li>
            <strong className="text-foreground">Everything is square.</strong>{" "}
            No radii, no shadows; hover is a background change.
          </li>
        </ul>
      </header>

      <Spec title="Type roles">
        <div className="surface-panel divide-y divide-border">
          {(Object.keys(TYPE) as TypeRole[]).map((role) => {
            const style = TYPE[role]
            return (
              <div
                key={role}
                className="grid items-baseline gap-group p-base md:grid-cols-[16rem_1fr]"
              >
                <div className="flex flex-col gap-inline">
                  <span className="type-label">{role}</span>
                  <span className="type-meta text-muted-foreground">
                    {style.size}/{style.lineHeight} · {style.weight}
                  </span>
                  <span className="type-meta text-muted-foreground">
                    {TYPE_USE[role]}
                  </span>
                </div>
                <p className={TYPE_CLASS[role]}>
                  A directory of paseo.sh plugins
                </p>
              </div>
            )
          })}
        </div>
      </Spec>

      <Spec title="Spacing roles">
        <div className="surface-panel divide-y divide-border">
          {(Object.keys(SPACE) as SpaceRole[]).map((role) => (
            <div
              key={role}
              className="grid items-center gap-group p-base md:grid-cols-[16rem_1fr]"
            >
              <div className="flex flex-col gap-inline">
                <span className="type-label">{role}</span>
                <span className="type-meta text-muted-foreground">
                  {SPACE[role]}px · gap-{role}, p-{role}
                </span>
              </div>
              <div className="flex items-center gap-stack">
                <div
                  className="h-3 bg-primary"
                  style={{ width: SPACE[role] }}
                  aria-hidden="true"
                />
                <span className="type-meta text-muted-foreground">
                  {SPACE_USE[role]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Spec>

      <Spec title="Icon sizes">
        <div className="surface-panel flex flex-wrap items-end gap-section p-base">
          {(Object.keys(ICON) as IconSize[]).map((size) => (
            <div key={size} className="flex flex-col items-center gap-group">
              <IconDownload className={ICON_CLASS[size]} />
              <span className="type-label">{size}</span>
              <span className="type-meta text-muted-foreground">
                {ICON[size]}px
              </span>
            </div>
          ))}
          <p className="type-meta max-w-sm text-muted-foreground">
            An icon with no size class renders at <code>md</code>. Use{" "}
            <code>sm</code> beside meta text, <code>lg</code> for placeholders,{" "}
            <code>xl</code> for overlay glyphs.
          </p>
        </div>
      </Spec>

      <Spec id="surfaces" title="Surfaces">
        <div className="grid gap-base md:grid-cols-2">
          <div className="surface-panel flex flex-col gap-inline p-base">
            <span className="type-label">surface-panel</span>
            <span className="type-meta text-muted-foreground">
              Cards, tiles, callouts, form groups.
            </span>
          </div>
          <div className="surface-inset flex flex-col gap-inline p-base">
            <span className="type-label">surface-inset</span>
            <span className="type-meta text-muted-foreground">
              Code, commands, previews.
            </span>
          </div>
          <a
            href="#surfaces"
            className="surface-panel surface-interactive flex flex-col gap-inline p-base"
          >
            <span className="type-label">+ surface-interactive</span>
            <span className="type-meta text-muted-foreground">
              A panel that navigates. Hover me.
            </span>
          </a>
          <p className="empty-state">empty-state</p>
        </div>
        <div className="grid gap-base md:grid-cols-2">
          <Alert>
            <IconAlertTriangle />
            <AlertTitle>Alert</AlertTitle>
            <AlertDescription>
              Notices sit on the panel surface.
            </AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>Destructive alert</AlertTitle>
            <AlertDescription>Errors reuse it, in red.</AlertDescription>
          </Alert>
        </div>
      </Spec>

      <Spec title="Controls">
        <div className="flex flex-col gap-base">
          <div className="flex flex-wrap items-center gap-chip">
            <Button>Default</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-chip">
            <Button size="sm">Filter chip on</Button>
            <Button size="sm" variant="outline">
              Filter chip off
            </Button>
            <Button size="icon-sm" variant="outline" aria-label="Download">
              <IconDownload />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-chip">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
          <Input
            aria-label="Search plugins"
            placeholder="Search name, repo, owner…"
            className="max-w-sm"
          />
        </div>
      </Spec>

      {plugin ? (
        <Spec title="Plugin card">
          <div className="grid gap-base sm:grid-cols-2 xl:grid-cols-3">
            <PluginCard plugin={plugin} />
            <div className="surface-panel flex flex-col items-center justify-center gap-group p-base">
              <IconPhotoOff className="size-icon-lg text-muted-foreground/60" />
              <IconPlayerPlayFilled className="size-icon-xl text-muted-foreground/60" />
              <span className="type-meta text-muted-foreground">
                Placeholder art uses the lg and xl icon sizes.
              </span>
            </div>
          </div>
        </Spec>
      ) : null}
    </main>
  )
}
