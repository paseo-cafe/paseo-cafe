import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Heading block shared by every content section — title, optional supporting
 * line, optional trailing action — so section headers look the same on every
 * page. Pass `as="h3"` when the section is nested under another heading; it
 * steps down to the subheading type role.
 */
export function SectionHeader({
  id,
  title,
  description,
  action,
  as: Heading = "h2",
  className,
}: {
  id?: string
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  as?: "h2" | "h3"
  className?: string
}) {
  return (
    <div className={cn("flex items-end justify-between gap-stack", className)}>
      <div className="flex min-w-0 flex-col gap-inline">
        <Heading
          id={id}
          className={cn(
            "section-anchor",
            Heading === "h3" ? "type-subheading" : "type-heading"
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p className="type-body text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}
