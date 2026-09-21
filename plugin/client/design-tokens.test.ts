import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { TYPE, type TypeRole } from "../shared/design-tokens"
import { typeStyle } from "./visual"

vi.mock("react-native", () => ({ Platform: { OS: "web" } }))

const CLIENT_DIR = dirname(fileURLToPath(import.meta.url))

/** Style properties whose values must come from plugin/shared/design-tokens.ts. */
const TOKEN_PROPS =
  "fontSize|lineHeight|letterSpacing|gap|rowGap|columnGap|padding\\w*|margin\\w*|border\\w*Width|border\\w*Radius"

// `prop: value` where the value runs to the next comma, and continues across a
// line break only when the next line starts a ternary branch (`? a` / `: b`).
const STYLE_PROP = new RegExp(
  `\\b(?:${TOKEN_PROPS})\\s*:\\s*((?:[^,;{}\\n]|\\n(?=\\s*[?:]))*)`,
  "g"
)
const ICON_SIZE = /<Icon\b[^>]*?\bsize=\{\s*-?\d[^}]*\}/g
const NUMBER = /(?<![\w.$])\d+(?:\.\d+)?/g
// `size / 2` derives a circle's radius from its own size; it is not a magic number.
const DIVISION = /\/\s*\d+(?:\.\d+)?/g
const ALLOW = /\/\/ design-tokens: allow\s+\S/

/** Blank out comments (keeping every newline) so they never match. */
function blankComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (comment) =>
    comment.replace(/[^\n]/g, " ")
  )
}

/** Every raw numeric style literal in `source`, as `file:line  text`. */
function findRawStyleNumbers(file: string, source: string): string[] {
  const lines = source.split("\n")
  const code = blankComments(source)
  const lineOf = (index: number) => code.slice(0, index).split("\n").length
  const found: string[] = []
  const report = (index: number, text: string) => {
    const line = lineOf(index)
    if (ALLOW.test(lines[line - 1] ?? "")) return
    found.push(`${file}:${line}  ${text.replace(/\s+/g, " ").trim()}`)
  }

  for (const match of code.matchAll(STYLE_PROP)) {
    const value = (match[1] ?? "").replace(DIVISION, "")
    if ((value.match(NUMBER) ?? []).some((n) => Number(n) !== 0)) {
      report(match.index, match[0])
    }
  }
  for (const match of code.matchAll(ICON_SIZE)) {
    const at = match.index + match[0].lastIndexOf("size=")
    report(at, match[0].slice(match[0].lastIndexOf("size=")))
  }
  return found
}

function clientSourceFiles(): string[] {
  return readdirSync(CLIENT_DIR).filter(
    (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)
  )
}

describe("plugin client styles use the shared design tokens", () => {
  it("has no raw spacing, type, border, or icon-size numbers", () => {
    const files = clientSourceFiles()
    expect(files.length).toBeGreaterThan(5)

    const violations = files.flatMap((name) =>
      findRawStyleNumbers(
        `plugin/client/${name}`,
        readFileSync(join(CLIENT_DIR, name), "utf8")
      )
    )

    expect(
      violations,
      [
        "Raw numeric style values drift from the website's scale.",
        "Use SPACE / ICON / BORDER_WIDTH from plugin/shared/design-tokens.ts, and",
        "...typeStyle(<role>) from ./visual for text. A value with no token (a touch",
        "target, an image size) stays raw only with a `// design-tokens: allow <reason>`",
        "comment on the same line.",
      ].join("\n")
    ).toEqual([])
  })

  describe("the scan", () => {
    const scan = (code: string) => findRawStyleNumbers("x.tsx", code)

    it("flags literals, including inside ternaries and wrapped values", () => {
      expect(scan("const a = { padding: 12 }")).toHaveLength(1)
      expect(scan("const a = { gap: compact ? 16 : 24 }")).toHaveLength(1)
      expect(
        scan("const a = {\n  fontSize:\n    compact ? 12 : 14,\n}")
      ).toEqual(["x.tsx:2  fontSize: compact ? 12 : 14"])
      expect(scan("const a = { borderRightWidth: 1 }")).toHaveLength(1)
      expect(scan('<Icon\n  name="X"\n  size={16}\n/>')).toEqual([
        "x.tsx:3  size={16}",
      ])
    })

    it("accepts zero, tokens, and non-token properties", () => {
      expect(scan("const a = { margin: 0, gap: SPACE.chip }")).toEqual([])
      expect(
        scan("const a = { padding: compact ? SPACE.a : SPACE.b }")
      ).toEqual([])
      expect(scan("const a = { borderRadius: SIZE / 2 }")).toEqual([])
      expect(
        scan("const a = { minHeight: 44, maxWidth: 960, flex: 1 }")
      ).toEqual([])
      expect(scan("<Icon size={ICON.sm} />")).toEqual([])
      expect(scan("// gap: 8 in a comment\nconst a = 1")).toEqual([])
    })

    it("honors an allow comment only when it states a reason", () => {
      expect(
        scan("const a = { gap: 3 } // design-tokens: allow hairline")
      ).toEqual([])
      expect(scan("const a = { gap: 3 } // design-tokens: allow")).toHaveLength(
        1
      )
    })
  })
})

describe("typeStyle", () => {
  const roles = Object.keys(TYPE) as TypeRole[]

  it("carries each role's size and line height", () => {
    for (const role of roles) {
      expect(typeStyle(role)).toMatchObject({
        fontSize: TYPE[role].size,
        lineHeight: TYPE[role].lineHeight,
      })
    }
  })

  it("draws the medium weight semibold and leaves the rest alone", () => {
    expect(TYPE.label.weight).toBe(500)
    expect(typeStyle("label").fontWeight).toBe("600")
    expect(typeStyle("eyebrow").fontWeight).toBe("600")
    expect(typeStyle("heading").fontWeight).toBe("600")
    expect(typeStyle("body").fontWeight).toBe("400")
    expect(typeStyle("meta").fontWeight).toBe("400")
  })

  it("converts em tracking to a pixel letter spacing", () => {
    for (const role of roles) {
      expect(typeStyle(role).letterSpacing).toBeCloseTo(
        TYPE[role].tracking * TYPE[role].size
      )
    }
  })

  it("uppercases only the eyebrow", () => {
    expect(typeStyle("eyebrow").textTransform).toBe("uppercase")
    for (const role of roles.filter((name) => name !== "eyebrow")) {
      expect(typeStyle(role)).not.toHaveProperty("textTransform")
    }
  })
})
