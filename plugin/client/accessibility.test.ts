import { describe, expect, it } from "vitest"
import {
  expandableAccessibilityLabel,
  filterAccessibilityLabel,
} from "./accessibility"

describe("catalog accessibility labels", () => {
  it("announces visible facet counts", () => {
    expect(filterAccessibilityLabel("clear", "categories", 47)).toBe(
      "Clear categories filter, 47 plugins"
    )
    expect(filterAccessibilityLabel("filter", "GitHub", 3)).toBe(
      "Filter by GitHub, 3 plugins"
    )
    expect(filterAccessibilityLabel("filter", "GitHub")).toBe(
      "Filter by GitHub"
    )
  })

  it("announces collapsed status summaries", () => {
    expect(expandableAccessibilityLabel(false, "Security scan", "Failed")).toBe(
      "Expand Security scan, Failed"
    )
    expect(
      expandableAccessibilityLabel(true, "Health checks", "5/6 passed")
    ).toBe("Collapse Health checks, 5/6 passed")
  })
})
