import type { PluginRecord } from "@/lib/plugin-schema"
import { getCatalogRepositoryUrl } from "../../plugin/shared/catalog"

/** Exact source tree reviewed by a published security attestation, when present. */
export function pluginRepositoryUrl(
  plugin: Pick<PluginRecord, "repo" | "path" | "security">
): string {
  return getCatalogRepositoryUrl({
    repo: plugin.repo,
    path: plugin.path,
    ref: plugin.security?.commit,
  })
}
