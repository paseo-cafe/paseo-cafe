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

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(directorySettings)
  const directoryUrl = async (): Promise<string | undefined> => {
    const current = await settings?.read()
    return current?.status === "ready" ? current.values.directoryUrl : undefined
  }

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
