import { useCallback, useEffect, useRef, useState } from "react";
import { VideoEmbedPlayer } from "@/components/video-embed";
import type { PluginRecord } from "@/lib/plugin-schema";
import { ImageZoom } from "./kibo-ui/image-zoom";

const NAV_BUTTON_CLASS =
  "fixed top-1/2 z-10 flex size-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border-none bg-foreground/70 text-background outline-offset-2";

// react-medium-image-zoom gives each image its own <dialog>, all portalled
// into one shared container. Opening the next one before this one has
// actually finished its close transition leaves two native <dialog>s
// fighting over the browser's top layer — the new one calls showModal()
// successfully but silently ends up closed again. Closing first and only
// opening the next after this delay avoids that overlap.
const REOPEN_DELAY_MS = 300;

/** Combined screenshots + demo videos for a plugin's detail page. Videos first — they're the richer asset when present. */
export function MediaGallery({
  plugin,
}: {
  plugin: Pick<PluginRecord, "name" | "images" | "videos">;
}) {
  const { images, videos } = plugin;
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);
  const reopenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingReopen = useCallback(() => {
    if (reopenTimeoutRef.current !== null) {
      clearTimeout(reopenTimeoutRef.current);
      reopenTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearPendingReopen, [clearPendingReopen]);

  const stepZoomedIndex = useCallback(
    (offset: number) => {
      setZoomedIndex((current) => {
        if (current === null || images.length === 0) return current;
        const next = (current + offset + images.length) % images.length;
        clearPendingReopen();
        reopenTimeoutRef.current = setTimeout(() => {
          reopenTimeoutRef.current = null;
          setZoomedIndex(next);
        }, REOPEN_DELAY_MS);
        return null;
      });
    },
    [images.length, clearPendingReopen],
  );

  // Arrow-key navigation between zoomed images. The library's own keydown
  // handler (Escape-to-close) lives on `document` too, but it only calls
  // stopPropagation — which blocks the event from reaching other DOM nodes,
  // not other listeners already registered on `document` — so this doesn't
  // fight with it.
  useEffect(() => {
    if (zoomedIndex === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepZoomedIndex(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepZoomedIndex(1);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [zoomedIndex, stepZoomedIndex]);

  if (images.length === 0 && videos.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 font-medium text-foreground/60 text-sm">Gallery</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {videos.map((video) => (
          <div
            key={video.kind === "file" ? video.url : video.embedUrl}
            className="ring-1 ring-foreground/10"
          >
            <VideoEmbedPlayer video={video} />
          </div>
        ))}
        {images.map((src, index) => (
          <ImageZoom
            key={src}
            isZoomed={zoomedIndex === index}
            onZoomChange={(isZoomed) => {
              clearPendingReopen();
              setZoomedIndex(isZoomed ? index : null);
            }}
            ZoomContent={
              images.length > 1
                ? ({ img, buttonUnzoom }) => (
                    <>
                      {img}
                      {buttonUnzoom}
                      {/*<button
                        type="button"
                        aria-label="Previous image"
                        className={`${NAV_BUTTON_CLASS} left-4`}
                        onClick={(e) => {
                          e.stopPropagation()
                          stepZoomedIndex(-1)
                        }}
                      >
                        <IconChevronLeft />
                      </button>
                      <button
                        type="button"
                        aria-label="Next image"
                        className={`${NAV_BUTTON_CLASS} right-4`}
                        onClick={(e) => {
                          e.stopPropagation()
                          stepZoomedIndex(1)
                        }}
                      >
                        <IconChevronRight />
                      </button>*/}
                    </>
                  )
                : undefined
            }
          >
            <img
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
