import { describe, expect, it } from "vitest"
import { extractThemePreviews } from "./theme-previews"

const darkColors = `{
  background: "#282828",
  foreground: "#ebdbb2",
  raised: "#3c3836",
  control: "#504945",
  border: "#504945",
  accent: "#fabd2f",
  mutedForeground: "#a89984",
  ring: "#928374",
}`

describe("extractThemePreviews", () => {
  it("extracts direct contributions whose colors use a static palette", () => {
    const result = extractThemePreviews(`
      const dark = ${darkColors}
      export default function contribute(client: PluginClientContext) {
        client.addTheme({
          id: "gruvbox-dark",
          name: "Gruvbox Dark",
          appearance: "dark",
          colors: dark,
        })
      }
    `)

    expect(result).toEqual([
      {
        id: "gruvbox-dark",
        name: "Gruvbox Dark",
        appearance: "dark",
        colors: {
          background: "#282828",
          foreground: "#ebdbb2",
          raised: "#3c3836",
          control: "#504945",
          border: "#504945",
          accent: "#fabd2f",
          mutedForeground: "#a89984",
          ring: "#928374",
        },
      },
    ])
  })

  it("extracts static arrays registered through a for-of loop", () => {
    const result = extractThemePreviews(`
      const themes: PluginThemeContribution[] = [
        { id: "latte", name: "Latte", appearance: "light", colors: ${darkColors} },
        { id: "mocha", name: "Mocha", appearance: "dark", colors: ${darkColors} },
      ]
      for (const theme of themes) client.addTheme(theme)
    `)

    expect(result.map(({ id, appearance }) => ({ id, appearance }))).toEqual([
      { id: "latte", appearance: "light" },
      { id: "mocha", appearance: "dark" },
    ])
  })

  it("resolves shadowed palette names from the nearest lexical scope", () => {
    const result = extractThemePreviews(`
      function validTheme(client: PluginClientContext) {
        const palette = ${darkColors}
        client.addTheme({
          id: "valid",
          name: "Valid",
          appearance: "dark",
          colors: palette,
        })
      }

      function unrelatedHelper() {
        const palette = buildColors()
        return palette
      }
    `)

    expect(result.map(({ id }) => id)).toEqual(["valid"])
  })

  it("ignores computed or malformed contributions instead of executing them", () => {
    expect(
      extractThemePreviews(`
        client.addTheme(buildTheme())
        client.addTheme({
          id: "invalid",
          name: "Invalid",
          appearance: "dark",
          colors: { ...getColors() },
        })
      `)
    ).toEqual([])
  })
})
