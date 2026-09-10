import { sanitizeReadmeHtmlForDisplay } from "@/lib/sanitize-readme-html"

export function PluginReadme({ html }: { html: string }) {
  return (
    <div className="mt-3 border-border border-l-2 pl-4">
      <p className="mb-1 text-foreground/40 text-xs uppercase tracking-wide">
        README
      </p>
      <div
        className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-none prose-pre:bg-muted"
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: The scan pipeline sanitizes this HTML; legacy image tags and relative links are removed again here. */
        dangerouslySetInnerHTML={{
          __html: sanitizeReadmeHtmlForDisplay(html),
        }}
      />
    </div>
  )
}
