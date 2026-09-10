import { describe, expect, it } from "vitest"
import { renderMarkdownToHtml } from "./markdown"

describe("renderMarkdownToHtml", () => {
  it("renders GFM code fences and headings", async () => {
    const html = await renderMarkdownToHtml(
      "### Prerequisites\n\n```bash\npaseo plugin add owner/repo\n```"
    )
    expect(html).toContain("<h3>Prerequisites</h3>")
    expect(html).toContain("<pre><code")
    expect(html).toContain("paseo plugin add owner/repo")
  })

  it("drops a raw script tag instead of rendering it (no rehype-raw, so it's inert text at worst)", async () => {
    const html = await renderMarkdownToHtml(
      'Hello <script>alert("xss")</script> world'
    )
    expect(html).not.toContain("<script")
    expect(html).not.toContain("</script>")
  })

  it("strips a javascript: link href", async () => {
    const html = await renderMarkdownToHtml("[click me](javascript:alert(1))")
    expect(html).not.toContain("javascript:")
  })

  it("keeps a normal https link", async () => {
    const html = await renderMarkdownToHtml("[paseo](https://paseo.sh)")
    expect(html).toContain('href="https://paseo.sh"')
  })
})
