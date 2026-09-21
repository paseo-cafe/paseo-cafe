import { describe, expect, it } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("lets a design-token spacing role replace a numeric one", () => {
    expect(cn("gap-2", "gap-chip")).toBe("gap-chip")
    expect(cn("p-4", "p-base")).toBe("p-base")
    expect(cn("size-4", "size-icon-md")).toBe("size-icon-md")
  })

  it("lets a type role replace raw type utilities set earlier", () => {
    expect(cn("font-medium text-sm", "type-heading")).toBe("type-heading")
  })

  // One-way on purpose: a later `font-semibold` must not delete a whole role.
  it("keeps a type role when a raw utility follows it", () => {
    expect(cn("type-label", "font-semibold")).toBe("type-label font-semibold")
  })

  it("keeps unrelated classes", () => {
    expect(cn("gap-chip", "p-base", "type-meta")).toBe(
      "gap-chip p-base type-meta"
    )
  })
})
