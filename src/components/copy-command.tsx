import { IconCheck, IconCopy } from "@tabler/icons-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

export function CopyCommand({
  command,
  className,
}: {
  command: string
  className?: string
}) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div
      className={cn(
        "flex min-w-0 max-w-full items-center justify-between gap-3 border border-border bg-muted px-4 py-3",
        className
      )}
    >
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-sm">
        {command}
      </code>
      <Button
        variant="outline"
        size="icon-sm"
        className="shrink-0"
        onClick={() => copy(command)}
        aria-label="Copy install command"
      >
        {copied ? (
          <IconCheck className="size-3.5" />
        ) : (
          <IconCopy className="size-3.5" />
        )}
      </Button>
    </div>
  )
}
