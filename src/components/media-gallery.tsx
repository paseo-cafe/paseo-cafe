import { VideoEmbedPlayer } from "@/components/video-embed";
import type { PluginRecord } from "@/lib/plugin-schema";
import { ImageZoom } from "./kibo-ui/image-zoom";

/** Combined screenshots + demo videos for a plugin's detail page. Videos first — they're the richer asset when present. */
export function MediaGallery({
  plugin,
}: {
  plugin: Pick<PluginRecord, "name" | "images" | "videos">;
}) {
  if (plugin.images.length === 0 && plugin.videos.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 font-medium text-foreground/60 text-sm">Gallery</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {plugin.videos.map((video) => (
          <div
            key={video.kind === "file" ? video.url : video.embedUrl}
            className="ring-1 ring-foreground/10"
          >
            <VideoEmbedPlayer video={video} />
          </div>
        ))}
        {plugin.images.map((src) => (
          <ImageZoom>
            <img
              key={src}
              src={src}
              alt={`${plugin.name} screenshot`}
              className="w-full rounded-none ring-1 ring-foreground/10"
            />
          </ImageZoom>
        ))}
      </div>
    </div>
  );
}
