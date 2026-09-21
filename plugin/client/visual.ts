import type { PluginTheme } from "@getpaseo/plugin"
import { Platform } from "react-native"
import {
  BORDER_WIDTH,
  CONTROL_RADIUS,
  SPACE,
  TYPE,
  type TypeRole,
} from "../shared/design-tokens"

export const CAFE_MONO_FONT =
  Platform.OS === "ios" ? "ui-monospace" : "monospace"

export const CAFE_CONTROL_RADIUS = CONTROL_RADIUS

/**
 * Android's system monospace only distinguishes regular from bold, so the
 * shared "medium" (500) weight is drawn semibold there — and on iOS, where it
 * keeps the label visibly heavier than body text.
 */
const NATIVE_FONT_WEIGHT = {
  400: "400",
  500: "600",
  600: "600",
} as const

/**
 * React Native text style for one of the shared type roles (see
 * `TYPE` in ../shared/design-tokens). The caller adds only the color:
 * `theme.colors.foreground` or `theme.colors.foregroundMuted`.
 */
export function typeStyle(role: TypeRole) {
  const style = TYPE[role]
  return {
    fontFamily: CAFE_MONO_FONT,
    fontSize: style.size,
    lineHeight: style.lineHeight,
    fontWeight: NATIVE_FONT_WEIGHT[style.weight],
    letterSpacing: style.tracking * style.size,
    ...(style.uppercase ? { textTransform: "uppercase" as const } : {}),
  }
}

/**
 * The website's `surface-panel`: a flat, hairline-bordered box on the card
 * background. Rows, expandable sections, and callouts all use it, so a box on
 * one surface looks like a box on the other. Add padding at the call site.
 */
export function panelStyle(theme: PluginTheme) {
  return {
    borderWidth: BORDER_WIDTH,
    borderColor: theme.colors.border,
    borderRadius: CAFE_CONTROL_RADIUS,
    backgroundColor: theme.colors.surface1,
  }
}

/** The website's `surface-inset`: a bordered well for code and previews. */
export function insetStyle(theme: PluginTheme) {
  return {
    ...panelStyle(theme),
    backgroundColor: theme.colors.surface2,
  }
}

/** The website's `Badge`: a borderless tinted chip for metadata and tags. */
export function chipStyle(theme: PluginTheme) {
  return {
    borderRadius: CAFE_CONTROL_RADIUS,
    paddingHorizontal: SPACE.group,
    paddingVertical: SPACE.hair,
    backgroundColor: theme.colors.surface2,
  }
}
