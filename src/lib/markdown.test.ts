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

  it("does not render raw script markup", async () => {
    const html = await renderMarkdownToHtml(
      'Hello <script>alert("xss")</script> world'
    )
    expect(html).not.toContain("<script")
    expect(html).not.toContain("</script>")
  })

  it("strips javascript: link URLs", async () => {
    const html = await renderMarkdownToHtml("[click me](javascript:alert(1))")
    expect(html).toContain("click me")
    expect(html).not.toContain("javascript:")
  })

  it("strips data: link URLs", async () => {
    const html = await renderMarkdownToHtml(
      "[download](data:text/html,%3Cscript%3Ealert(1)%3C/script%3E)"
    )
    expect(html).toContain("download")
    expect(html).not.toContain("data:")
  })

  it("removes README images and event-handler markup", async () => {
    const html = await renderMarkdownToHtml(
      '![tracking pixel](https://tracker.example/pixel.gif)\n\n<img src="x" onerror="alert(1)">'
    )
    expect(html).not.toContain("<img")
    expect(html).not.toContain("onerror")
    expect(html).not.toContain("tracker.example")
  })

  it("keeps a normal https link", async () => {
    const html = await renderMarkdownToHtml("[paseo](https://paseo.sh)")
    expect(html).toContain('href="https://paseo.sh"')
  })
})
