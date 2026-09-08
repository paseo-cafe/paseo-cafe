import { describe, expect, it } from "vitest"
import { extractReadmeImages, resolveGitHubAssetImages } from "./images"

describe("extractReadmeImages", () => {
  it("extracts a markdown image with an absolute URL", () => {
    const readme = "![Screenshot](https://example.com/shot.png)"
    expect(extractReadmeImages(readme)).toEqual([
      "https://example.com/shot.png",
    ])
  })

  it("extracts a markdown image with a title", () => {
    const readme = '![Screenshot](docs/shot.png "the main screen")'
    expect(extractReadmeImages(readme)).toEqual(["docs/shot.png"])
  })

  it("extracts a markdown image wrapped in angle brackets", () => {
    const readme = "![Screenshot](<./assets/shot 1.png>)"
    expect(extractReadmeImages(readme)).toEqual(["./assets/shot 1.png"])
  })

  it("extracts a raw <img> tag", () => {
    const readme =
      '<p align="center"><img src="./images/demo.gif" width="600" /></p>'
    expect(extractReadmeImages(readme)).toEqual(["./images/demo.gif"])
  })

  it("finds images anywhere in the repo, not just an images/ directory", () => {
    const readme =
      "![Setup](docs/setup.png)\n![Result](.github/result.png)\n![Root](shot.png)"
    expect(extractReadmeImages(readme)).toEqual([
      "docs/setup.png",
      ".github/result.png",
      "shot.png",
    ])
  })

  it("excludes ambiguous GitHub asset links, leaving them for resolveGitHubAssetImages", () => {
    const readme = "![Demo](https://github.com/user-attachments/assets/abc-123)"
    expect(extractReadmeImages(readme)).toEqual([])
  })

  it("dedupes repeated references and caps the total count", () => {
    const many = Array.from(
      { length: 10 },
      (_, i) => `![shot](shot-${i}.png)`
    ).join("\n")
    const images = extractReadmeImages(`${many}\n![shot](shot-0.png)`)
    expect(images).toHaveLength(8)
    expect(new Set(images).size).toBe(8)
  })

  it("returns an empty array for a README with no images", () => {
    expect(extractReadmeImages("Just a description, no pictures.")).toEqual([])
  })
})

describe("resolveGitHubAssetImages", () => {
  const url = "https://github.com/user-attachments/assets/abc"

  it("keeps a link that resolves to an image content type", async () => {
    const images = await resolveGitHubAssetImages(url, async () => "image/png")
    expect(images).toEqual([url])
  })

  it("drops a link that resolves to a video content type", async () => {
    const images = await resolveGitHubAssetImages(url, async () => "video/mp4")
    expect(images).toEqual([])
  })

  it("drops a link whose type can't be resolved", async () => {
    const images = await resolveGitHubAssetImages(url, async () => null)
    expect(images).toEqual([])
  })

  it("respects the shared cap against `existing`", async () => {
    const readme = Array.from(
      { length: 4 },
      (_, i) => `https://github.com/user-attachments/assets/id${i}`
    ).join("\n")
    const existing = Array.from({ length: 7 }, (_, i) => `existing-${i}.png`)
    const images = await resolveGitHubAssetImages(
      readme,
      async () => "image/png",
      existing
    )
    expect(images).toHaveLength(1)
  })
})
