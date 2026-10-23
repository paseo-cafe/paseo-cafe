import type {
  PluginClientContext,
  PluginSurfaceProps,
} from "@getpaseo/plugin/client"
import { createElement } from "react"
import { DEFAULT_LOCALE } from "../shared/directory"
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
    // The app language, read on every render. `i18n` is absent on hosts
    // before Paseo 0.13, which show the English listing.
    Component: (props: PluginSurfaceProps) =>
      createElement(DirectorySurface, {
        ...props,
        locale: client.i18n?.locale ?? DEFAULT_LOCALE,
      }),
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
