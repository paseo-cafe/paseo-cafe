import { IconChevronDown } from "@tabler/icons-react"
import type { ReactNode } from "react"

/** A collapsed-by-default `<details>` block, styled to match across the sidebar. */
export function ExpandableSection({
  title,
  subtitle,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
}) {
  return (
    <details className="surface-panel p-stack">
      <summary className="type-label flex cursor-pointer list-none items-center justify-between gap-stack [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-group">
          <span>{title}</span>
          {subtitle ? (
            <span className="type-meta text-muted-foreground">{subtitle}</span>
          ) : null}
        </span>
        <IconChevronDown className="shrink-0 text-muted-foreground" />
      </summary>
      <div className="mt-stack">{children}</div>
    </details>
  )
}
