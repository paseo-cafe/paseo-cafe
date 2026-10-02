import type { PluginClientContext } from "@getpaseo/plugin/client"
import { DirectorySettings } from "./client/DirectorySettings"
import { registerDirectory } from "./client/register"
import {
  directoryAttachments,
  directoryManifestAttachments,
  directoryReadmeAttachments,
  directorySecurityAttachments,
} from "./shared/directory"

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(directoryAttachments)
  client.addAttachmentSource(directoryManifestAttachments)
  client.addAttachmentSource(directoryReadmeAttachments)
  client.addAttachmentSource(directorySecurityAttachments)
  client.addSettingsScreen({
    id: "settings",
    title: "Paseo Cafe",
    icon: "Settings",
    Component: DirectorySettings,
  })
  registerDirectory(client)
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
