import type { PluginRecord } from "@/lib/plugin-schema"
import { pluginRepositoryUrl } from "@/lib/plugin-source"
import { SITE_REPO, SITE_URL } from "@/lib/site"

/** Prefilled "report this plugin" GitHub issue link against the site's own repo. */
export function buildReportIssueUrl(
  plugin: Pick<PluginRecord, "id" | "name" | "repo" | "path" | "security">
): string {
  const issueUrl = new URL(`https://github.com/${SITE_REPO}/issues/new`)
  issueUrl.searchParams.set(
    "title",
    `Report plugin: ${plugin.name} (${plugin.id})`
  )
  issueUrl.searchParams.set(
    "body",
    [
      `Plugin ID: ${plugin.id}`,
      `Source repository URL: ${pluginRepositoryUrl(plugin)}`,
      `Listing URL: ${new URL(
        `/plugins/${encodeURIComponent(plugin.id)}`,
        SITE_URL
      ).toString()}`,
      "",
      "Please describe the problem here.",
    ].join("\n")
  )

  return issueUrl.toString()
}
