import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

export function CopyCommand({ command }: { command: string }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div className="flex items-center justify-between gap-3 border border-border bg-muted px-4 py-3">
      <code className="overflow-x-auto whitespace-pre text-sm">{command}</code>
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
