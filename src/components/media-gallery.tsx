import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { useCallback, useEffect, useState } from "react"
import {
  Dialog,
  DialogClose,
  DialogOverlay,
  DialogPopup,
  DialogPortal,
} from "@/components/ui/dialog"
import { VideoEmbedPlayer } from "@/components/video-embed"
import type { PluginRecord } from "@/lib/plugin-schema"

// Circular, semi-transparent controls that read against any screenshot,
// rather than the themed Button component — these sit directly on top of
// the photo, not on a themed surface.
const OVERLAY_BUTTON_CLASS =
  "pointer-events-auto absolute z-10 flex size-10 touch-manipulation items-center justify-center rounded-full border-none bg-foreground/70 text-background outline-offset-2"

// Cap the thumbnail grid so a plugin with a dozen screenshots doesn't turn
// the page into a wall of images — the rest are still one click and an
// arrow-key press away, just not each given their own tile.
const MAX_VISIBLE_IMAGES = 4

// Tailwind col/row span for one tile in a 4-col x 2-row bento grid, given
// how many tiles are actually visible. Always fills the grid with no gaps:
// 1 tile takes it whole, 2 split it into even halves, 3 give the first
// tile a full-height "hero" half with the other two stacked beside it, and
// 4 additionally split that stacked half into two square tiles.
function bentoTileClass(index: number, visibleCount: number): string {
  if (visibleCount === 1) return "col-span-4 row-span-2"
  if (visibleCount === 2) return "col-span-2 row-span-2"
  if (index === 0) return "col-span-2 row-span-2"
  if (visibleCount === 3) return "col-span-2 row-span-1"
  return index === 1 ? "col-span-2 row-span-1" : "col-span-1 row-span-1"
}

/** Combined screenshots + demo videos for a plugin's detail page. Videos first — they're the richer asset when present. */
export function MediaGallery({
  plugin,
}: {
  plugin: Pick<PluginRecord, "name" | "images" | "videos">
}) {
  const { images, videos } = plugin
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null)

  // The dialog never closes while stepping between images — only the <img>'s
  // src changes — so this is a plain, instant state update. (An earlier
  // version used react-medium-image-zoom, which gives every image its own
  // native <dialog>; stepping meant closing one and opening another, which
  // was both jarring and, if the next one opened before the first finished
  // closing, silently broken — two <dialog>s fighting over the browser's
  // top layer. One persistent dialog whose content swaps avoids both.)
  const stepZoomedIndex = useCallback(
    (offset: number) => {
      setZoomedIndex((current) => {
        if (current === null || images.length === 0) return current
        return (current + offset + images.length) % images.length
      })
    },
    [images.length]
  )

  // Arrow-key navigation between zoomed images.
  useEffect(() => {
    if (zoomedIndex === null) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        stepZoomedIndex(-1)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        stepZoomedIndex(1)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [zoomedIndex, stepZoomedIndex])

  if (images.length === 0 && videos.length === 0) return null

  const visibleImages = images.slice(0, MAX_VISIBLE_IMAGES)
  const hiddenImageCount = images.length - visibleImages.length

  return (
    <div>
      <h2 className="mb-2 font-medium text-foreground/60 text-sm">Gallery</h2>
      {videos.length > 0 ? (
        <div className="mb-3 grid gap-3 sm:grid-cols-2">
          {videos.map((video) => (
            <div
              key={video.kind === "file" ? video.url : video.embedUrl}
              className="ring-1 ring-foreground/10"
            >
              <VideoEmbedPlayer video={video} />
            </div>
          ))}
        </div>
      ) : null}
      {visibleImages.length === 1 ? (
        <button
          type="button"
          aria-label={`Expand image: ${plugin.name} screenshot`}
          className="cursor-zoom-in"
          onClick={() => setZoomedIndex(0)}
        >
          <img
            src={visibleImages[0]}
            alt={`${plugin.name} screenshot`}
            className="w-full rounded-none ring-1 ring-foreground/10"
          />
        </button>
      ) : null}
      {visibleImages.length > 1 ? (
        <div className="grid h-72 grid-cols-4 grid-rows-2 gap-2 sm:h-96">
          {visibleImages.map((src, index) => {
            const isLastTile = index === visibleImages.length - 1
            const moreCount = isLastTile ? hiddenImageCount : 0
            return (
              <button
                key={src}
                type="button"
                aria-label={
                  moreCount > 0
                    ? `Expand image: ${plugin.name} screenshot, plus ${moreCount} more`
                    : `Expand image: ${plugin.name} screenshot`
                }
                className={`relative cursor-zoom-in overflow-hidden ${bentoTileClass(index, visibleImages.length)}`}
                onClick={() => setZoomedIndex(index)}
              >
                <img
                  src={src}
                  alt={`${plugin.name} screenshot`}
                  className="size-full rounded-none object-cover ring-1 ring-foreground/10"
                />
                {moreCount > 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70 font-medium text-foreground text-xl">
                    +{moreCount}
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      <Dialog
        open={zoomedIndex !== null}
        onOpenChange={(open) => {
          if (!open) setZoomedIndex(null)
        }}
      >
        <DialogPortal>
          <DialogOverlay className="bg-background/80 backdrop-blur-md" />
          {/* pointer-events-none so both the empty space and the image itself
              fall through to the overlay's own outside-click dismissal —
              clicking the photo closes it, same as the old zoom-out
              convention. Only the buttons opt back in, below. */}
          <DialogPopup
            aria-label={
              zoomedIndex !== null
                ? `${plugin.name} screenshot ${zoomedIndex + 1} of ${images.length}`
                : undefined
            }
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center outline-none"
          >
            {zoomedIndex !== null ? (
              <img
                src={images[zoomedIndex]}
                alt={`${plugin.name} screenshot`}
                className="pointer-events-none max-h-[90dvh] max-w-[90dvw] object-contain"
              />
            ) : null}
            <DialogClose
              aria-label="Close"
              className={`${OVERLAY_BUTTON_CLASS} top-4 right-4`}
            >
              <IconX />
            </DialogClose>
            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  className={`${OVERLAY_BUTTON_CLASS} top-1/2 left-4 -translate-y-1/2`}
                  onClick={() => stepZoomedIndex(-1)}
                >
                  <IconChevronLeft />
                </button>
                <button
                  type="button"
                  aria-label="Next image"
                  className={`${OVERLAY_BUTTON_CLASS} top-1/2 right-4 -translate-y-1/2`}
                  onClick={() => stepZoomedIndex(1)}
                >
                  <IconChevronRight />
                </button>
              </>
            ) : null}
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </div>
  )
}
