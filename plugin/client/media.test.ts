import { describe, expect, it } from "vitest"
import { firstImageMedia, isVideoMediaUrl } from "./media"

describe("isVideoMediaUrl", () => {
  it("matches mp4 and webm paths, with or without a query or fragment", () => {
    expect(isVideoMediaUrl("https://x.test/a.mp4")).toBe(true)
    expect(isVideoMediaUrl("https://x.test/a.WEBM?raw=1")).toBe(true)
    expect(isVideoMediaUrl("https://x.test/a.png")).toBe(false)
    expect(isVideoMediaUrl("https://x.test/mp4/a.png")).toBe(false)
  })
})

describe("firstImageMedia", () => {
  it("returns the first URL when it is an image", () => {
    expect(
      firstImageMedia(["https://x.test/a.png", "https://x.test/b.png"])
    ).toBe("https://x.test/a.png")
  })

  it("skips leading videos, including ones with a query string or fragment", () => {
    expect(
      firstImageMedia([
        "https://x.test/demo.MP4",
        "https://x.test/clip.webm?raw=1",
        "https://x.test/loop.mp4#t=2",
        "https://x.test/shot.png",
      ])
    ).toBe("https://x.test/shot.png")
  })

  it("does not mistake a video extension in the middle of the path for a video", () => {
    expect(firstImageMedia(["https://x.test/mp4/shot.png"])).toBe(
      "https://x.test/mp4/shot.png"
    )
  })

  it("is undefined when there is no media or only videos", () => {
    expect(firstImageMedia([])).toBeUndefined()
    expect(firstImageMedia(["https://x.test/demo.mp4"])).toBeUndefined()
  })
})
