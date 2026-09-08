import type { PluginServerContext } from "@getpaseo/plugin/server"
import {
  installDirectoryPlugin,
  listDirectory,
  searchDirectory,
} from "./server/directory"
import {
  directoryInstallRpc,
  directoryListRpc,
  directorySearchRpc,
  directorySettings,
} from "./shared/directory"

export default function contribute(server: PluginServerContext) {
  server.registerSettings(directorySettings)
  server.handle(directoryListRpc, (input) => listDirectory(input))
  server.handle(directorySearchRpc, (input) => searchDirectory(input))
  server.handle(directoryInstallRpc, (input) => installDirectoryPlugin(input))
  return () => {}
}
