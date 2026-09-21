import { IconCheck, IconCopy } from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

export function CopyCommand({
  command,
  className,
  copyAriaLabel = "Copy install command",
}: {
  command: string
  className?: string
  copyAriaLabel?: string
}) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div
      className={cn(
        "surface-inset flex min-w-0 max-w-full items-center justify-between gap-stack px-base py-stack",
        className
      )}
    >
      <code className="type-body min-w-0 flex-1 overflow-x-auto whitespace-pre">
        {command}
      </code>
      <Button
        variant="outline"
        size="icon-sm"
        className="shrink-0"
        onClick={() => copy(command)}
        aria-label={copyAriaLabel}
      >
        {copied ? (
          <IconCheck className="size-icon-sm" />
        ) : (
          <IconCopy className="size-icon-sm" />
        )}
      </Button>
    </div>
  )
}
