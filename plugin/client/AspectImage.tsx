import { useEffect, useState } from "react"
import { Image } from "react-native"

interface AspectImageProps {
  uri: string
  backgroundColor: string
  borderRadius?: number
}

/**
 * Full-width image that preserves its own aspect ratio, reading real
 * dimensions via Image.getSize since RN doesn't do this from the source
 * alone. Only sensible outside a host-sized Modal (see ImageLightbox) —
 * inside our own full-width surface, the container really does have the
 * width to give each image, so this can just ask for what it needs.
 */
export function AspectImage({
  uri,
  backgroundColor,
  borderRadius = 10,
}: AspectImageProps) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9)

  useEffect(() => {
    let cancelled = false
    Image.getSize(
      uri,
      (width, height) => {
        if (!cancelled && height > 0) setAspectRatio(width / height)
      },
      () => {}
    )
    return () => {
      cancelled = true
    }
  }, [uri])

  return (
    <Image
      source={{ uri }}
      resizeMode="contain"
      style={{ width: "100%", aspectRatio, borderRadius, backgroundColor }}
    />
  )
}
