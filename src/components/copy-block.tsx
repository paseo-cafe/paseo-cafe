import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

/** Multi-line variant of CopyCommand — a code block with a copy button pinned to the top-right corner. */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div className="relative border border-border bg-muted">
      {label ? (
        <p className="border-border border-b px-4 py-2 pr-10 text-foreground/40 text-xs uppercase tracking-wide">
          {label}
        </p>
      ) : null}
      <pre className="overflow-x-auto px-4 py-3 text-sm">
        <code>{code}</code>
      </pre>
      <Button
        variant="outline"
        size="icon-sm"
        className="absolute top-2 right-2"
        onClick={() => copy(code)}
        aria-label="Copy to clipboard"
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
