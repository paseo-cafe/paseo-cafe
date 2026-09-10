import type { PluginServerContext } from "@getpaseo/plugin/server"
import {
  createDirectoryInstaller,
  listDirectory,
  listDirectoryUpdateStatus,
  searchDirectory,
  searchDirectoryManifests,
  searchDirectoryReadmes,
  searchDirectorySecurity,
  updateDirectoryPlugin,
} from "./server/directory"
import { createInstallReportManager } from "./server/telemetry"
import {
  directoryCancelInstallReportsRpc,
  directoryCompleteInstallReportRpc,
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
  const reports = createInstallReportManager()
  const installDirectoryPlugin = createDirectoryInstaller({ reports })
  server.registerSettings(directorySettings)
  server.handle(directoryListRpc, (input) => listDirectory(input))
  server.handle(directoryUpdateStatusRpc, (input) =>
    listDirectoryUpdateStatus(input)
  )
  server.handle(directorySearchRpc, (input) => searchDirectory(input))
  server.handle(directoryManifestSearchRpc, (input) =>
    searchDirectoryManifests(input)
  )
  server.handle(directoryReadmeSearchRpc, (input) =>
    searchDirectoryReadmes(input)
  )
  server.handle(directorySecuritySearchRpc, (input) =>
    searchDirectorySecurity(input)
  )
  server.handle(directoryInstallRpc, (input) => installDirectoryPlugin(input))
  server.handle(
    directoryCompleteInstallReportRpc,
    ({ reportToken, consent }) => ({
      scheduled: reports.complete(reportToken, consent),
    })
  )
  server.handle(directoryCancelInstallReportsRpc, () => {
    reports.cancelAll()
    return {}
  })
  server.handle(directoryUpdateRpc, (input) => updateDirectoryPlugin(input))
  return () => reports.dispose()
}
