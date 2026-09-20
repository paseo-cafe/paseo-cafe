import type { PluginRecord } from "@/lib/plugin-schema"
import {
  getCatalogInstallCommand,
  getCatalogNpmInstallCommand,
  getCatalogNpmInstallCommandForChannel,
} from "../../plugin/shared/catalog"

/** Returns only immutable catalog install targets; missing scan metadata stays unavailable. */
export function getGitInstallCommand(
  plugin: Pick<PluginRecord, "repo" | "path" | "security">
): string | undefined {
  if (
    (plugin.path?.length ?? 0) > 500 ||
    plugin.security?.status !== "passed" ||
    !plugin.security.commit
  ) {
    return undefined
  }
  return getCatalogInstallCommand({
    repo: plugin.repo,
    path: plugin.path,
    ref: plugin.security.commit,
  })
}

export function getInstallCommand(
  plugin: Pick<
    PluginRecord,
    "package" | "version" | "repo" | "path" | "security"
  >
): string | undefined {
  if (plugin.package) {
    return plugin.version
      ? getCatalogNpmInstallCommand(plugin.package, plugin.version)
      : undefined
  }
  return getGitInstallCommand(plugin)
}

export function getPreviewInstallCommand(
  plugin: Pick<PluginRecord, "package" | "npm" | "npmPreview">
): string | undefined {
  return getCatalogNpmInstallCommandForChannel(plugin, "preview")
}
