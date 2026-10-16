import type { PluginTheme } from "@getpaseo/plugin"

const MIN_TEXT_CONTRAST = 4.5

type Rgb = readonly [number, number, number]

function parseHex(color: string): Rgb | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!match?.[1]) return undefined
  const value = Number.parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function luminance([red, green, blue]: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
  )
}

/** WCAG contrast ratio, or undefined when either colour is not a plain `#rrggbb`. */
export function contrastRatio(a: string, b: string): number | undefined {
  const first = parseHex(a)
  const second = parseHex(b)
  if (!first || !second) return undefined
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (x, y) => y - x
  )
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

/** Muted text colour that stays readable on `background`, falling back to the foreground. */
export function mutedTextColor(
  theme: PluginTheme,
  background: string = theme.colors.surface0
): string {
  const ratio = contrastRatio(theme.colors.foregroundMuted, background)
  return ratio !== undefined && ratio < MIN_TEXT_CONTRAST
    ? theme.colors.foreground
    : theme.colors.foregroundMuted
}
