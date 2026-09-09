import type { PluginServerContext } from "@getpaseo/plugin/server"
import {
  installDirectoryPlugin,
  listDirectory,
  searchDirectory,
  updateDirectoryPlugin,
} from "./server/directory"
import {
  directoryInstallRpc,
  directoryListRpc,
  directorySearchRpc,
  directorySettings,
  directoryUpdateRpc,
} from "./shared/directory"

export default function contribute(server: PluginServerContext) {
  server.registerSettings(directorySettings)
  server.handle(directoryListRpc, (input) => listDirectory(input))
  server.handle(directorySearchRpc, (input) => searchDirectory(input))
  server.handle(directoryInstallRpc, (input) => installDirectoryPlugin(input))
  server.handle(directoryUpdateRpc, (input) => updateDirectoryPlugin(input))
  return () => {}
}
