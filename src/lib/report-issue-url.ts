import { SITE_REPO, SITE_URL } from "@/lib/site"

/** Prefilled "report this plugin" GitHub issue link against the site's own repo. */
export function buildReportIssueUrl(plugin: {
  id: string
  name: string
  url: string
}): string {
  const issueUrl = new URL(`https://github.com/${SITE_REPO}/issues/new`)
  issueUrl.searchParams.set(
    "title",
    `Report plugin: ${plugin.name} (${plugin.id})`
  )
  issueUrl.searchParams.set(
    "body",
    [
      `Plugin ID: ${plugin.id}`,
      `Source repository URL: ${plugin.url}`,
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
