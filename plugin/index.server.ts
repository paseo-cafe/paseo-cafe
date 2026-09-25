import type { PluginServerContext } from "@getpaseo/plugin/server"
import {
  applyDirectorySelfUpdate,
  installDirectoryPlugin,
  listDirectory,
  listDirectoryUpdateStatus,
  runAutomaticPluginUpdates,
  searchDirectory,
  searchDirectoryManifests,
  searchDirectoryReadmes,
  searchDirectorySecurity,
  updateDirectoryPlugin,
} from "./server/directory"
import {
  directoryApplySelfUpdateRpc,
  directoryInstallRpc,
  directoryListRpc,
  directoryManifestSearchRpc,
  directoryReadmeSearchRpc,
  directoryRunAutomaticUpdatesRpc,
  directorySearchRpc,
  directorySecuritySearchRpc,
  directorySettings,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
} from "./shared/directory"

interface DirectorySettingsValues {
  directoryUrl: string
  previewOptIns?: string[]
  autoUpdateOptIns?: string[]
}
interface DirectorySettingsReader {
  read(): Promise<
    { status: "ready"; values: DirectorySettingsValues } | { status: "invalid" }
  >
}

async function readDirectorySettings(
  settings: DirectorySettingsReader | undefined
): Promise<DirectorySettingsValues | undefined> {
  if (!settings) return undefined
  try {
    const current = await settings.read()
    return current.status === "ready" ? current.values : undefined
  } catch {
    return undefined
  }
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

interface AutomaticUpdateLifecycleDependencies {
  run: typeof runAutomaticPluginUpdates
}

export default function contribute(
  server: PluginServerContext,
  dependencies: AutomaticUpdateLifecycleDependencies = {
    run: runAutomaticPluginUpdates,
  }
) {
  const settings = server.registerSettings(directorySettings)
  const directoryUrl = () => readDirectoryUrl(settings)
  let disposed = false
  const automaticUpdateAbort = new AbortController()

  const readAutomaticUpdateSettings = async () => {
    if (disposed) return undefined
    const current = await readDirectorySettings(settings)
    if (!current || disposed) return undefined
    return {
      baseUrl: current.directoryUrl,
      previewOptIns: current.previewOptIns ?? [],
      autoUpdateOptIns: current.autoUpdateOptIns ?? [],
    }
  }
  const runAutomaticUpdates = () =>
    dependencies.run(
      readAutomaticUpdateSettings,
      undefined,
      automaticUpdateAbort.signal
    )

  const runScheduledAutomaticUpdates = () => {
    void runAutomaticUpdates().catch(() => undefined)
  }
  const startup = setTimeout(runScheduledAutomaticUpdates, 30_000)
  const interval = setInterval(runScheduledAutomaticUpdates, 6 * 60 * 60_000)

  server.handle(directoryListRpc, (input) => listDirectory(input))
  server.handle(directoryUpdateStatusRpc, (input) =>
    listDirectoryUpdateStatus(input)
  )
  server.handle(directoryRunAutomaticUpdatesRpc, async () => ({
    outcomes: await runAutomaticUpdates(),
  }))
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
  server.handle(directoryInstallRpc, async (input) =>
    installDirectoryPlugin(input, await directoryUrl())
  )
  server.handle(directoryUpdateRpc, async (input) =>
    updateDirectoryPlugin(input, await directoryUrl())
  )
  server.handle(directoryApplySelfUpdateRpc, (input) =>
    applyDirectorySelfUpdate(input)
  )
  return () => {
    disposed = true
    automaticUpdateAbort.abort()
    clearTimeout(startup)
    clearInterval(interval)
  }
}
