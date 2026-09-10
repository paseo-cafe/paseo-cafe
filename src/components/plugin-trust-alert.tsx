import { IconAlertTriangle } from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { PluginRecord } from "@/lib/plugin-schema"
import { pluginRepositoryUrl } from "@/lib/plugin-source"
import { isOfficialPlugin, SITE_NAME } from "@/lib/site"

/** Warns that a listing is unaudited third-party code — skipped for plugins published by the official org. */
export function PluginTrustAlert({ plugin }: { plugin: PluginRecord }) {
  if (isOfficialPlugin(plugin)) return null
  const repositoryUrl = pluginRepositoryUrl(plugin)

  return (
    <Alert>
      <IconAlertTriangle />
      <AlertTitle>
        Community-submitted — not owned or vetted by {SITE_NAME}
      </AlertTitle>
      <AlertDescription>
        This listing is generated automatically from the plugin's own public
        repository. We don't audit, endorse, or take responsibility for
        third-party plugin code. Paseo plugins are trusted, unsandboxed code
        with filesystem, process, and network access on the machine they run on
        — read the source at{" "}
        <a href={repositoryUrl} target="_blank" rel="noreferrer">
          {plugin.repo}
        </a>{" "}
        before installing.
      </AlertDescription>
    </Alert>
  )
}
