import { SectionHeader } from "@/components/section-header"
import { sanitizeReadmeHtmlForDisplay } from "@/lib/sanitize-readme-html"

export function PluginReadme({ html }: { html: string }) {
  return (
    <section
      className="flex flex-col gap-base"
      aria-labelledby="readme-heading"
    >
      <SectionHeader id="readme-heading" title="README" />
      <div
        className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-none border-border border-l-2 prose-pre:bg-muted pl-base prose-pre:text-foreground"
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: The scan pipeline sanitizes this HTML; legacy image tags and relative links are removed again here. */
        dangerouslySetInnerHTML={{
          __html: sanitizeReadmeHtmlForDisplay(html),
        }}
      />
    </section>
  )
}
