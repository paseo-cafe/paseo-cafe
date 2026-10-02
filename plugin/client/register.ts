import type { PluginClientContext } from "@getpaseo/plugin/client"
import { DirectorySurface } from "./DirectorySurface"
import { DIRECTORY_SCREEN_ID, DirectorySidebarItem } from "./SidebarItem"

const TITLE = "Paseo Cafe"

/**
 * Paseo 0.11 renders `addSidebarHeaderItem` components, which can carry the
 * update badge. Older apps lack it and throw on the call, which would fail the
 * whole client entry, so they keep the `addSurface` + `addSidebarItem` pair
 * (removed from Paseo after 2027-03-29). The id stays `directory` on both
 * paths so saved sidebar order and links survive the switch.
 */
export function registerDirectory(client: PluginClientContext): void {
  if (typeof client.addSidebarHeaderItem === "function") {
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
  } else {
    client.addSurface(DIRECTORY_SCREEN_ID, DirectorySurface)
    client.addSidebarItem({
      id: DIRECTORY_SCREEN_ID,
      title: TITLE,
      icon: "Coffee",
      surface: DIRECTORY_SCREEN_ID,
    })
  }
  client.addCommandCenterItem({
    id: "open-directory",
    title: "Browse Paseo Cafe",
    icon: "Coffee",
    context: "global",
    onSelect(context) {
      if (typeof context.openScreen === "function") {
        context.openScreen({ screenId: DIRECTORY_SCREEN_ID })
      } else {
        context.openSurface(DIRECTORY_SCREEN_ID)
      }
    },
  })
}
