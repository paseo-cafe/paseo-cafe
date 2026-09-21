import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guardrail for the design system (AGENTS.md → "Design system"; tokens in
 * plugin/shared/design-tokens.ts). Page chrome — everything outside the shadcn
 * primitives in components/ui — must use the shared roles instead of raw
 * Tailwind values, so spacing, type, muted text, surfaces, and icons cannot
 * drift apart again.
 */

const SRC = join(process.cwd(), "src")

// theme-preview.tsx paints a miniature Paseo UI from a plugin's own palette;
// its proportions belong to the specimen, not to this site's chrome.
const EXEMPT_FILES = new Set(["theme-preview.tsx"])

function chromeFiles(): { name: string; source: string }[] {
  const files: { name: string; source: string }[] = []
  for (const dir of ["components", "routes"]) {
    for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
      const name = entry.name
      if (!entry.isFile() || !name.endsWith(".tsx")) continue
      if (name.includes(".test.") || EXEMPT_FILES.has(name)) continue
      files.push({
        name: `src/${dir}/${name}`,
        source: readFileSync(join(SRC, dir, name), "utf8"),
      })
    }
  }
  return files
}

const RULES: { rule: RegExp; fix: string; allow?: RegExp }[] = [
  {
    rule: /\bgap(?:-[xy])?-\d/g,
    fix: "use a spacing role: gap-inline / chip / group / stack / base / section",
  },
  {
    rule: /\b(?:[mp][trblxy]?|space-[xy])-\d+(?:\.\d+)?\b/g,
    fix: "use a named spacing role instead of a numeric spacing utility",
  },
  {
    rule: /\btext-foreground\/\d+/g,
    fix: "secondary text is `text-muted-foreground` — there is no third tier",
  },
  {
    rule: /\bborder-border\/\d+/g,
    fix: "borders are one hairline: `border-border`",
  },
  {
    rule: /\bring-foreground\/10\b/g,
    fix: "outline images with `border border-border`; boxes use `surface-panel`",
  },
  {
    rule: /\bhover:shadow/g,
    fix: "the Cafe look is flat: use `surface-interactive` for hover feedback",
  },
  {
    rule: /\btext-(?:xs|sm|lg|xl|[2-9]xl)\b/g,
    fix: "use a type role: type-display / title / heading / subheading / lead / body / label / meta / eyebrow",
    // Decorative 404 numerals — not text a reader is meant to read as type.
    allow: /text-6xl/,
  },
  {
    rule: /<Icon[A-Za-z]+[^>]*\bsize-(?:3\.5|4|5|6|8)\b/g,
    fix: "icons default to size-icon-md; otherwise size-icon-sm / lg / xl",
  },
]

describe("design system conformance", () => {
  for (const { rule, fix, allow } of RULES) {
    it(`no raw ${rule.source} in page chrome (${fix})`, () => {
      const violations: string[] = []
      for (const { name, source } of chromeFiles()) {
        source.split("\n").forEach((line, index) => {
          for (const match of line.matchAll(rule)) {
            if (allow?.test(match[0])) continue
            violations.push(`${name}:${index + 1}  ${match[0]}`)
          }
        })
      }
      expect(violations, fix).toEqual([])
    })
  }
})
