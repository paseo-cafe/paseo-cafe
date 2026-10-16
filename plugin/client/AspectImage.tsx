import { useEffect, useState } from "react"
import { Image, Text, View } from "react-native"
import { radius } from "./visual"

interface AspectImageProps {
  uri: string
  backgroundColor: string
  /** Tall screenshots would otherwise be several screens high; they are letterboxed to this. */
  maxHeight?: number
  /** Describes the image to assistive technology; the registry supplies no captions. */
  label: string
  borderRadius?: number
  /** Colour of the "Image unavailable" note, which replaces an image that fails to load. */
  fallbackTextColor?: string
}

/**
 * Full-width image that preserves its own aspect ratio, reading real
 * dimensions via Image.getSize since RN doesn't do this from the source
 * alone. Only sensible inside our own full-width surface, where the container
 * really does have the width to give each image.
 */
export function AspectImage({
  uri,
  backgroundColor,
  maxHeight,
  label,
  borderRadius = radius.md,
  fallbackTextColor,
}: AspectImageProps) {
  const [aspectRatio, setAspectRatio] = useState(16 / 9)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
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

  const frame = {
    width: "100%" as const,
    aspectRatio,
    maxHeight,
    borderRadius,
    backgroundColor,
  }

  if (failed) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${label}, image unavailable`}
        style={[
          frame,
          {
            alignItems: "center" as const,
            justifyContent: "center" as const,
            overflow: "hidden" as const,
          },
        ]}
      >
        <Text style={{ color: fallbackTextColor, fontSize: 12 }}>
          Image unavailable
        </Text>
      </View>
    )
  }

  return (
    <Image
      source={{ uri }}
      resizeMode="contain"
      accessible
      accessibilityLabel={label}
      alt={label}
      onError={() => setFailed(true)}
      style={frame}
    />
  )
}
