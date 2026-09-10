import type { PluginClientContext } from "@getpaseo/plugin/client"
import { DirectorySettings } from "./client/DirectorySettings"
import { DirectorySurface } from "./client/DirectorySurface"
import { directoryAttachments } from "./shared/directory"

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(directoryAttachments)
  client.addSettingsScreen({
    id: "settings",
    title: "Paseo Cafe",
    icon: "Settings",
    Component: DirectorySettings,
  })
  client.addSurface("directory", DirectorySurface)
  client.addSidebarItem({
    id: "directory",
    title: "Paseo Cafe",
    icon: "Coffee",
    surface: "directory",
  })
  client.addCommandCenterItem({
    id: "open-directory",
    title: "Browse Paseo Cafe",
    icon: "Coffee",
    context: "global",
    onSelect({ openSurface }) {
      openSurface("directory")
    },
  })
  client.addCommandCenterItem({
    id: "configure-directory",
    title: "Configure Paseo Cafe",
    icon: "Settings",
    context: "global",
    onSelect({ openSettings }) {
      openSettings("settings")
    },
  })
  return () => {}
}
