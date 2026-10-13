import type { PluginClientContext } from "@getpaseo/plugin/client"
import { DirectorySurface } from "./DirectorySurface"
import { DIRECTORY_SCREEN_ID, DirectorySidebarItem } from "./SidebarItem"

const TITLE = "Paseo Cafe"

/**
 * The directory is a screen plus a sidebar header item, which can carry the
 * update badge. The id stays `directory` so saved sidebar order and links
 * survive the pivot to the official registry.
 */
export function registerDirectory(client: PluginClientContext): void {
  client.addScreen({
    id: DIRECTORY_SCREEN_ID,
    title: TITLE,
    Component: DirectorySurface,
  })
  client.addSidebarHeaderItem({
    id: DIRECTORY_SCREEN_ID,
    title: TITLE,
    Component: DirectorySidebarItem,
  })
  client.addCommandCenterItem({
    id: "open-directory",
    title: "Browse Paseo Cafe",
    icon: "Coffee",
    context: "global",
    onSelect(context) {
      context.openScreen({ screenId: DIRECTORY_SCREEN_ID })
    },
  })
}
