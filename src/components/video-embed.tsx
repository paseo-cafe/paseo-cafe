import type { VideoEmbed } from "@/lib/plugin-schema"

/**
 * Renders one extracted demo video (src/lib/videos.ts). YouTube/Loom go
 * through their embed iframe on the privacy-respecting/no-cookie domain
 * where available; a direct file link renders as a native <video>. Every
 * src here was built from a regex-sanitized ID or an http(s)+known-extension
 * match at scan time, never from raw README text.
 */
export function VideoEmbedPlayer({ video }: { video: VideoEmbed }) {
  if (video.kind === "file") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: External demo videos do not include a caption track URL.
      <video
        src={video.url}
        controls
        className="aspect-video w-full bg-black"
      />
    )
  }

  return (
    <iframe
      src={video.embedUrl}
      title="Plugin demo video"
      className="aspect-video w-full border-0"
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  )
}
