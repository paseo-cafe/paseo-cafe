import { CopyCommand } from "@/components/copy-command"
import { getGitInstallCommand, getInstallCommand } from "@/lib/install-command"
import type { PluginRecord } from "@/lib/plugin-schema"

export function PluginInstallSection({ plugin }: { plugin: PluginRecord }) {
  const command = getInstallCommand(plugin)
  const gitCommand = getGitInstallCommand(plugin)
  return (
    <div>
      <h2 className="mb-2 font-medium text-foreground/60 text-sm">Install</h2>
      {plugin.package ? (
        <p className="mb-1 text-foreground/40 text-xs uppercase tracking-wide">
          npmjs · Paseo 0.9+
        </p>
      ) : null}
      {command ? (
        <CopyCommand command={command} />
      ) : (
        <p className="text-foreground/50 text-sm">
          Exact install target unavailable. Refresh after the next successful
          scan.
        </p>
      )}
      {plugin.package && gitCommand ? (
        <div className="mt-3">
          <p className="mb-1 text-foreground/40 text-xs uppercase tracking-wide">
            GitHub · Paseo 0.8 fallback
          </p>
          <CopyCommand command={gitCommand} />
        </div>
      ) : null}
      {plugin.security?.commit ? (
        <p className="mt-2 text-foreground/50 text-xs">
          Git security status and fallback installation are pinned to commit{" "}
          <code>{plugin.security.commit.slice(0, 12)}</code>.
        </p>
      ) : null}
      {plugin.installNotesHtml ? (
        <div className="mt-3 border-border border-l-2 pl-4">
          <p className="mb-1 text-foreground/40 text-xs uppercase tracking-wide">
            From the plugin's README
          </p>
          {/* installNotesHtml is sanitized at scan time (src/lib/markdown.ts)
              before it's ever written to data/plugins.json — never render
              raw third-party markdown here. */}
          <div
            className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-none prose-pre:bg-muted font-mono prose-pre:text-foreground text-foreground/70"
            /* biome-ignore lint/security/noDangerouslySetInnerHtml: The scan pipeline sanitizes this HTML with rehype-sanitize. */
            dangerouslySetInnerHTML={{ __html: plugin.installNotesHtml }}
          />
        </div>
      ) : null}
    </div>
  )
}
