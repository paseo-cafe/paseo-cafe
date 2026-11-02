import { describe, expect, it } from "vitest"
import { seo } from "./seo"
import { officialListingUrl } from "./site"

describe("redirects to the official registry", () => {
  it("sends a listing to its renamed official id, or the directory when unlisted", () => {
    expect(officialListingUrl("readable-agent-activity")).toBe(
      "https://paseo.sh/plugins/geoqiao/agent-activity"
    )
    expect(officialListingUrl("linear-tickets")).toBe(
      "https://paseo.sh/plugins"
    )
    expect(officialListingUrl("not-a-cafe-plugin")).toBe(
      "https://paseo.sh/plugins"
    )
  })

  it("refreshes to the target and makes it canonical", () => {
    const head = seo({
      title: "Example",
      description: "Example",
      path: "/plugins/example",
      redirect: "https://paseo.sh/plugins/acme/example",
    })
    expect(head.meta).toContainEqual({
      httpEquiv: "refresh",
      content: "0; url=https://paseo.sh/plugins/acme/example",
    })
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://paseo.sh/plugins/acme/example" },
    ])
  })
})
