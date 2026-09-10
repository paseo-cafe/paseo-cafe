import { IconAlertTriangle } from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { PluginRecord } from "@/lib/plugin-schema"
import { PLATFORM_LABELS } from "@/lib/registry-schema"

export function PluginCaveatsAlert({ plugin }: { plugin: PluginRecord }) {
  const hasCaveats =
    plugin.platforms.length > 0 ||
    plugin.caveats.length > 0 ||
    Boolean(plugin.limitationsNotesHtml)

  if (!hasCaveats) return null

  return (
    <Alert>
      <IconAlertTriangle />
      <AlertTitle>Caveats</AlertTitle>
      <AlertDescription>
        {plugin.platforms.length > 0 ? (
          <p>
            <strong className="text-foreground">Supported platforms:</strong>{" "}
            {plugin.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}.
          </p>
        ) : null}
        {plugin.caveats.length > 0 ? (
          <ul className="list-disc pl-4">
            {plugin.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
        {plugin.limitationsNotesHtml ? (
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide">
              From the plugin's README
            </p>
            {/* limitationsNotesHtml is sanitized at scan time (src/lib/markdown.ts) before
                it's ever written to data/plugins.json — never render raw third-party
                markdown here. */}
            <div
              className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-none prose-pre:bg-muted"
              /* biome-ignore lint/security/noDangerouslySetInnerHtml: The scan pipeline sanitizes this HTML with rehype-sanitize. */
              dangerouslySetInnerHTML={{
                __html: plugin.limitationsNotesHtml,
              }}
            />
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
