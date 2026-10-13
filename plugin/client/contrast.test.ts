import type { PluginTheme } from "@getpaseo/plugin"
import { describe, expect, it } from "vitest"
import { contrastRatio, mutedTextColor } from "./contrast"

function theme(colors: Partial<PluginTheme["colors"]>): PluginTheme {
  return {
    colors: {
      surface0: "#ffffff",
      surface1: "#ffffff",
      surface2: "#ffffff",
      border: "#cccccc",
      foreground: "#000000",
      foregroundMuted: "#555555",
      accent: "#20744a",
      accentForeground: "#ffffff",
      statusSuccess: "#00aa00",
      statusWarning: "#aa8800",
      statusDanger: "#aa0000",
      ...colors,
    },
  }
}

describe("contrastRatio", () => {
  it("matches the WCAG extremes and ignores colours it cannot parse", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5)
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5)
    expect(contrastRatio("rgb(0,0,0)", "#ffffff")).toBeUndefined()
  })
})

describe("mutedTextColor", () => {
  it("falls back to the foreground when muted text fails 4.5:1 on the badge background", () => {
    const light = theme({ foregroundMuted: "#71717a", foreground: "#18181b" })
    expect(mutedTextColor(light, "#f4f4f5")).toBe("#18181b")
  })

  it("keeps muted text that is readable", () => {
    const readable = theme({ foregroundMuted: "#52525b" })
    expect(mutedTextColor(readable, "#f4f4f5")).toBe("#52525b")
  })
})
