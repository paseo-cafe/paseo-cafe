import type { PluginServerContext } from "@getpaseo/plugin/server"
import {
  installDirectoryPlugin,
  listDirectory,
  listDirectoryUpdateStatus,
  searchDirectory,
  searchDirectoryManifests,
  searchDirectoryReadmes,
  searchDirectorySecurity,
  updateDirectoryPlugin,
} from "./server/directory"
import {
  directoryInstallRpc,
  directoryListRpc,
  directoryManifestSearchRpc,
  directoryReadmeSearchRpc,
  directorySearchRpc,
  directorySecuritySearchRpc,
  directorySettings,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
} from "./shared/directory"

interface DirectorySettingsReader {
  read(): Promise<
    | { status: "ready"; values: { directoryUrl: string } }
    | { status: "invalid" }
  >
}

export async function readDirectoryUrl(
  settings: DirectorySettingsReader | undefined
): Promise<string | undefined> {
  if (!settings) return undefined
  try {
    const current = await settings.read()
    return current.status === "ready" ? current.values.directoryUrl : undefined
  } catch {
    return undefined
  }
}

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(directorySettings)
  const directoryUrl = () => readDirectoryUrl(settings)

  server.handle(directoryListRpc, (input) => listDirectory(input))
  server.handle(directoryUpdateStatusRpc, (input) =>
    listDirectoryUpdateStatus(input)
  )
  server.handle(directorySearchRpc, async (input) =>
    searchDirectory(input, await directoryUrl())
  )
  server.handle(directoryManifestSearchRpc, async (input) =>
    searchDirectoryManifests(input, await directoryUrl())
  )
  server.handle(directoryReadmeSearchRpc, async (input) =>
    searchDirectoryReadmes(input, await directoryUrl())
  )
  server.handle(directorySecuritySearchRpc, async (input) =>
    searchDirectorySecurity(input, await directoryUrl())
  )
  server.handle(directoryInstallRpc, (input) => installDirectoryPlugin(input))
  server.handle(directoryUpdateRpc, (input) => updateDirectoryPlugin(input))
  return () => {}
}
