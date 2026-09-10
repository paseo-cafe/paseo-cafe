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
    <details className="rounded-none border border-border bg-card px-3 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-foreground/70 text-sm [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span>{title}</span>
          {subtitle ? (
            <span className="font-normal text-foreground/40 text-xs">
              {subtitle}
            </span>
          ) : null}
        </span>
        <span className="text-foreground/40 text-xs uppercase tracking-wide">
          <IconChevronDown />
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  )
}
