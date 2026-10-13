import { Platform } from "react-native"

export { contrastRatio, mutedTextColor } from "./contrast"

/**
 * Measured from the Paseo host UI (web): controls and rows use 6/8/12px
 * corners, body text is the platform system font at 14px, secondary text 12px,
 * and small labels 11px. `PluginTheme` carries colours only, so these are
 * constants rather than tokens read from the host.
 */
export const radius = { sm: 6, md: 8, lg: 12 } as const

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const

/** Monospace is for ids, versions and commands only; body text uses the system font. */
export const MONO_FONT = Platform.OS === "ios" ? "ui-monospace" : "monospace"

/** Smallest comfortable tap target; applied wherever the layout is compact or native. */
export const MIN_TOUCH = 44
