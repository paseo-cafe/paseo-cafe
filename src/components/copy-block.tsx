import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard"

/** Multi-line variant of CopyCommand — a code block with a copy button pinned to the top-right corner. */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <div className="surface-inset relative">
      {label ? (
        <p className="copy-block-label type-eyebrow border-border border-b px-base py-group text-muted-foreground">
          {label}
        </p>
      ) : null}
      <pre className="type-body overflow-x-auto px-base py-stack">
        <code>{code}</code>
      </pre>
      <Button
        variant="outline"
        size="icon-sm"
        className="absolute top-group right-group"
        onClick={() => copy(code)}
        aria-label="Copy to clipboard"
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
