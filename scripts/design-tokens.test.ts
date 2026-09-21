import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ICON, SPACE, TYPE } from "../plugin/shared/design-tokens"
import { buildDesignTokensCss } from "./build-design-tokens"

describe("design tokens", () => {
  it("keeps src/design-tokens.css in sync with plugin/shared/design-tokens.ts", () => {
    const committed = readFileSync(
      join(process.cwd(), "src", "design-tokens.css"),
      "utf8"
    )
    expect(committed, "run `bun run tokens:build` and commit the result").toBe(
      buildDesignTokensCss()
    )
  })

  it("emits a spacing variable for every spacing and icon role", () => {
    const css = buildDesignTokensCss()
    for (const role of Object.keys(SPACE)) {
      expect(css).toContain(`--spacing-${role}:`)
    }
    for (const size of Object.keys(ICON)) {
      expect(css).toContain(`--spacing-icon-${size}:`)
    }
  })

  it("emits a type utility for every type role", () => {
    const css = buildDesignTokensCss()
    for (const role of Object.keys(TYPE)) {
      expect(css).toContain(`@utility type-${role} {`)
    }
  })

  it("keeps every line height at least as tall as its font size", () => {
    for (const style of Object.values(TYPE)) {
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.size)
    }
  })
})
