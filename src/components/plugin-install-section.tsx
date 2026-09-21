import { CopyCommand } from "@/components/copy-command"
import { ExpandableSection } from "@/components/expandable-section"
import { SectionHeader } from "@/components/section-header"
import {
  getGitInstallCommand,
  getInstallCommand,
  getPreviewInstallCommand,
} from "@/lib/install-command"
import type { PluginRecord } from "@/lib/plugin-schema"

export function PluginInstallSection({ plugin }: { plugin: PluginRecord }) {
  const command = getInstallCommand(plugin)
  const gitCommand = getGitInstallCommand(plugin)
  const previewCommand = getPreviewInstallCommand(plugin)
  return (
    <section
      className="flex flex-col gap-base"
      aria-labelledby="install-heading"
    >
      <SectionHeader id="install-heading" title="Install" />
      <div className="flex flex-col gap-group">
        {plugin.package ? (
          <p className="type-eyebrow text-muted-foreground">
            npmjs · Paseo 0.9+
          </p>
        ) : null}
        {command ? (
          <CopyCommand command={command} />
        ) : (
          <p className="type-body text-muted-foreground">
            Exact install target unavailable. Refresh after the next successful
            scan.
          </p>
        )}
      </div>
      {previewCommand && plugin.npmPreview && plugin.npmPreviewSecurity ? (
        <ExpandableSection
          title="Preview"
          subtitle={`v${plugin.npmPreview.version} · npm dist-tag: next`}
        >
          <div className="flex flex-col gap-group">
            <p className="type-meta text-muted-foreground">
              Preview releases are unreleased plugin code. Install only if you
              want to test it; stable remains the default. Published{" "}
              {plugin.npmPreview.publishedAt.slice(0, 10)}.
            </p>
            <p className="type-meta text-muted-foreground">
              Security scan passed ·{" "}
              {plugin.npmPreviewSecurity?.blockingFindings} blocking ·{" "}
              {plugin.npmPreviewSecurity?.advisoryFindings} advisory.
            </p>
            <CopyCommand
              command={previewCommand}
              copyAriaLabel="Copy preview install command"
            />
          </div>
        </ExpandableSection>
      ) : null}
      {plugin.package && gitCommand ? (
        <div className="flex flex-col gap-group">
          <p className="type-eyebrow text-muted-foreground">
            GitHub · Paseo 0.8 fallback
          </p>
          <CopyCommand command={gitCommand} />
        </div>
      ) : null}
      {plugin.security?.commit ? (
        <p className="type-meta text-muted-foreground">
          Git security status and fallback installation are pinned to commit{" "}
          <code>{plugin.security.commit.slice(0, 12)}</code>.
        </p>
      ) : null}
      {plugin.installNotesHtml ? (
        <div className="flex flex-col gap-group border-border border-l-2 pl-base">
          <p className="type-eyebrow text-muted-foreground">
            From the plugin's README
          </p>
          {/* installNotesHtml is sanitized at scan time (src/lib/markdown.ts)
              before it's ever written to data/plugins.json — never render
              raw third-party markdown here. */}
          <div
            className="prose prose-sm dark:prose-invert max-w-none prose-pre:rounded-none prose-pre:bg-muted font-mono prose-pre:text-foreground text-muted-foreground"
            /* biome-ignore lint/security/noDangerouslySetInnerHtml: The scan pipeline sanitizes this HTML with rehype-sanitize. */
            dangerouslySetInnerHTML={{ __html: plugin.installNotesHtml }}
          />
        </div>
      ) : null}
    </section>
  )
}
