import { describe, expect, it } from "vitest"
import {
  clampCatalogPage,
  HOME_SEARCH_DEFAULT,
  parseCatalogSearch,
} from "./index"

describe("catalog search parameters", () => {
  it("supplies required defaults and coerces integer page strings", () => {
    expect(parseCatalogSearch({})).toEqual(HOME_SEARCH_DEFAULT)
    expect(parseCatalogSearch({ page: "3" }).page).toBe(3)
  })

  it.each([undefined, "invalid", "NaN", Number.NaN, -1, 0, 1.5])(
    "resolves invalid page %s to the first page",
    (page) => {
      expect(parseCatalogSearch({ page }).page).toBe(1)
    }
  )

  it("drops unknown categories", () => {
    expect(parseCatalogSearch({ category: "not-a-category" }).category).toBe("")
  })

  it("clamps a valid but unavailable page to the rendered page count", () => {
    const search = parseCatalogSearch({ page: "999999" })
    expect(clampCatalogPage(search.page, 4)).toBe(4)
    expect(clampCatalogPage(search.page, 0)).toBe(1)
  })
})
