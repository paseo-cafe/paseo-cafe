import { describe, expect, it } from "vitest"
import type { VideoEmbed } from "./plugin-schema"
import {
  extractGitHubAssetLinks,
  extractVideos,
  resolveGitHubAssetVideos,
} from "./videos"

describe("extractVideos", () => {
  it("extracts a youtube.com/watch link and builds a nocookie embed URL", () => {
    const readme =
      "See it in action: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    expect(extractVideos(readme)).toEqual([
      {
        kind: "youtube",
        id: "dQw4w9WgXcQ",
        embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        watchUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    ])
  })

  it("extracts a youtu.be short link", () => {
    // biome-ignore lint/security/noSecrets: This is a public YouTube fixture, not a credential.
    const videos = extractVideos("https://youtu.be/dQw4w9WgXcQ?si=abc")
    expect(videos).toHaveLength(1)
    expect(videos[0]).toMatchObject({ kind: "youtube", id: "dQw4w9WgXcQ" })
  })

  it("extracts a loom share link", () => {
    const videos = extractVideos(
      "Demo: https://www.loom.com/share/abcdef1234567890abcdef1234567890"
    )
    expect(videos).toEqual([
      {
        kind: "loom",
        id: "abcdef1234567890abcdef1234567890",
        embedUrl: "https://www.loom.com/embed/abcdef1234567890abcdef1234567890",
      },
    ])
  })

  it("extracts an explicit <video src> tag", () => {
    const readme =
      '<video src="https://github.com/user-attachments/assets/demo.mp4" controls></video>'
    expect(extractVideos(readme)).toEqual([
      {
        kind: "file",
        url: "https://github.com/user-attachments/assets/demo.mp4",
      },
    ])
  })

  it("extracts a bare link ending in a video extension", () => {
    const readme = "Watch: https://example.com/clips/demo.webm"
    expect(extractVideos(readme)).toEqual([
      { kind: "file", url: "https://example.com/clips/demo.webm" },
    ])
  })

  it("does not itself resolve an extensionless GitHub asset link (needs resolveGitHubAssetVideos)", () => {
    // Ambiguous with images at the URL level without a network call — see the
    // extractGitHubAssetLinks/resolveGitHubAssetVideos tests below.
    const readme = "https://github.com/user-attachments/assets/abc-def-123"
    expect(extractVideos(readme)).toEqual([])
  })

  it("dedupes repeated links and caps the total count", () => {
    const many = Array.from(
      { length: 6 },
      (_, i) => `https://www.youtube.com/watch?v=aaaaaaaaaa${i}`
    ).join("\n")
    const videos = extractVideos(
      `${many}\nhttps://www.youtube.com/watch?v=aaaaaaaaaa0`
    )
    expect(videos).toHaveLength(4)
    expect(
      new Set(videos.map((v) => (v.kind === "youtube" ? v.id : v))).size
    ).toBe(4)
  })

  it("returns an empty array for a README with no videos", () => {
    expect(extractVideos("Just some screenshots below.")).toEqual([])
  })
})

describe("extractGitHubAssetLinks", () => {
  it("extracts a current-format user-attachments asset URL", () => {
    const readme =
      "## Demo\n\nhttps://github.com/user-attachments/assets/cbb0166e-d981-4367-a5b4-5b12d2e7c14c"
    expect(extractGitHubAssetLinks(readme)).toEqual([
      "https://github.com/user-attachments/assets/cbb0166e-d981-4367-a5b4-5b12d2e7c14c",
    ])
  })

  it("extracts a legacy owner/repo/assets URL", () => {
    const readme = "https://github.com/acme/widget/assets/12345/abcde-fghij"
    expect(extractGitHubAssetLinks(readme)).toEqual([
      "https://github.com/acme/widget/assets/12345/abcde-fghij",
    ])
  })

  it("dedupes repeated links", () => {
    const url = "https://github.com/user-attachments/assets/abc"
    expect(extractGitHubAssetLinks(`${url}\n${url}`)).toEqual([url])
  })

  it("returns an empty array when there are no GitHub asset links", () => {
    expect(extractGitHubAssetLinks("https://example.com/demo.mp4")).toEqual([])
  })
})

describe("resolveGitHubAssetVideos", () => {
  const url = "https://github.com/user-attachments/assets/abc"

  it("keeps a link that resolves to a video content type", async () => {
    const videos = await resolveGitHubAssetVideos(url, async () => "video/mp4")
    expect(videos).toEqual([{ kind: "file", url }])
  })

  it("drops a link that resolves to an image content type", async () => {
    const videos = await resolveGitHubAssetVideos(url, async () => "image/png")
    expect(videos).toEqual([])
  })

  it("drops a link whose type can't be resolved", async () => {
    const videos = await resolveGitHubAssetVideos(url, async () => null)
    expect(videos).toEqual([])
  })

  it("skips a link already present in `existing`", async () => {
    const existing: VideoEmbed[] = [{ kind: "file", url }]
    let calls = 0
    const videos = await resolveGitHubAssetVideos(
      url,
      async () => {
        calls += 1
        return "video/mp4"
      },
      existing
    )
    expect(videos).toEqual([])
    expect(calls).toBe(0)
  })

  it("stops once the shared cap (existing + found) is reached", async () => {
    const readme = Array.from(
      { length: 4 },
      (_, i) => `https://github.com/user-attachments/assets/id${i}`
    ).join("\n")
    const existing: VideoEmbed[] = [
      {
        kind: "youtube",
        id: "a",
        embedUrl: "https://x",
        watchUrl: "https://y",
      },
      {
        kind: "youtube",
        id: "b",
        embedUrl: "https://x",
        watchUrl: "https://y",
      },
      {
        kind: "youtube",
        id: "c",
        embedUrl: "https://x",
        watchUrl: "https://y",
      },
    ]
    const videos = await resolveGitHubAssetVideos(
      readme,
      async () => "video/mp4",
      existing
    )
    expect(videos).toHaveLength(1)
  })
})
