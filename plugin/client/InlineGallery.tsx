import type { PluginTheme } from "@getpaseo/plugin"
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native"
import { useEffect, useMemo, useRef, useState } from "react"
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  ScrollView as NativeScrollView,
  NativeSyntheticEvent,
} from "react-native"
import { Platform, Pressable, Text, View } from "react-native"
import { AspectImage } from "./AspectImage"
import { isVideoMediaUrl } from "./media"
import { MIN_TOUCH, mutedTextColor, radius, space } from "./visual"

interface InlineGalleryProps {
  entryName: string
  /** Every media URL of the entry; labels count within it, as the full gallery page does. */
  media: readonly string[]
  /** The pages to show, in order. */
  urls: readonly string[]
  theme: PluginTheme
  compact: boolean
  onOpenGallery: () => void
}

/**
 * Horizontally paged strip of an entry's media. Swiping works on touch, and
 * the previous and next buttons with the position label cover mouse and
 * screen-reader users, who cannot page a scroll view. Tapping a page opens the
 * full gallery.
 */
export function InlineGallery({
  entryName,
  media,
  urls,
  theme,
  compact,
  onOpenGallery,
}: InlineGalleryProps) {
  const scrollRef = useRef<NativeScrollView>(null)
  // The page in view, mirrored in a ref so a width change can restore it.
  const indexRef = useRef(0)
  const [index, setIndex] = useState(0)
  const [width, setWidth] = useState(0)
  const last = urls.length - 1
  const current = Math.min(index, last)
  const frameHeight = compact ? 220 : 320
  const touch = compact || Platform.OS !== "web"
  const styles = useMemo(() => {
    const muted = mutedTextColor(theme)
    const buttonSize = touch ? MIN_TOUCH : 36
    return {
      root: { gap: space.sm },
      header: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "space-between" as const,
        gap: space.md,
      },
      label: { color: muted, fontSize: 12, fontWeight: "600" as const },
      link: {
        minHeight: touch ? MIN_TOUCH : undefined,
        justifyContent: "center" as const,
      },
      linkText: {
        color: theme.colors.foreground,
        fontSize: 12,
        textDecorationLine: "underline" as const,
      },
      viewport: {
        height: frameHeight,
        borderRadius: radius.lg,
        overflow: "hidden" as const,
        backgroundColor: theme.colors.surface2,
      },
      page: {
        width,
        height: frameHeight,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      pagePress: { width: "100%" as const, justifyContent: "center" as const },
      videoTile: {
        width: "100%" as const,
        height: frameHeight,
        alignItems: "center" as const,
        justifyContent: "center" as const,
      },
      videoText: {
        color: mutedTextColor(theme, theme.colors.surface2),
        fontSize: 14,
      },
      controls: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: space.md,
      },
      step: {
        width: buttonSize,
        height: buttonSize,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      stepDisabled: { opacity: 0.4 },
      position: {
        color: muted,
        fontSize: 12,
        minWidth: 56,
        textAlign: "center" as const,
      },
    }
  }, [theme, touch, frameHeight, width])

  // A resize changes the page width, which would leave the scroll offset between pages.
  useEffect(() => {
    if (width > 0) {
      scrollRef.current?.scrollTo({
        x: indexRef.current * width,
        animated: false,
      })
    }
  }, [width])

  const select = (next: number) => {
    const clamped = Math.min(last, Math.max(0, next))
    indexRef.current = clamped
    setIndex(clamped)
    return clamped
  }

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) select(Math.round(event.nativeEvent.contentOffset.x / width))
  }

  const step = (delta: number) => {
    const next = select(current + delta)
    scrollRef.current?.scrollTo({ x: next * width, animated: false })
  }

  const renderStep = (delta: -1 | 1) => {
    const disabled = delta < 0 ? current <= 0 : current >= last
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          delta < 0 ? "Previous screenshot" : "Next screenshot"
        }
        accessibilityState={{ disabled }}
        disabled={disabled}
        style={[styles.step, disabled ? styles.stepDisabled : null]}
        onPress={() => step(delta)}
      >
        <Icon
          name={delta < 0 ? "ChevronLeft" : "ChevronRight"}
          size={16}
          color={theme.colors.foreground}
        />
      </Pressable>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text role="heading" aria-level={2} style={styles.label}>
          Gallery
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open gallery for ${entryName}`}
          style={styles.link}
          onPress={onOpenGallery}
        >
          <Text
            style={styles.linkText}
          >{`Open gallery (${media.length})`}</Text>
        </Pressable>
      </View>
      <View
        style={styles.viewport}
        onLayout={(event: LayoutChangeEvent) =>
          setWidth(event.nativeEvent.layout.width)
        }
      >
        {width > 0 ? (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
          >
            {urls.map((url, page) => {
              const position = media.indexOf(url) + 1
              // Pages beside the one in view are mounted so a swipe lands on a loaded image; the rest wait.
              const mounted = Math.abs(page - current) <= 1
              return (
                <View key={url} style={styles.page}>
                  {mounted ? (
                    isVideoMediaUrl(url) ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open gallery, ${entryName} video ${position} of ${media.length}`}
                        style={styles.videoTile}
                        onPress={onOpenGallery}
                      >
                        <Text style={styles.videoText}>Video</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open gallery, ${entryName} screenshot ${position} of ${media.length}`}
                        style={styles.pagePress}
                        onPress={onOpenGallery}
                      >
                        <AspectImage
                          uri={url}
                          maxHeight={frameHeight}
                          label={`${entryName} screenshot ${position} of ${media.length}`}
                          backgroundColor={theme.colors.surface2}
                          borderRadius={0}
                          fallbackTextColor={mutedTextColor(
                            theme,
                            theme.colors.surface2
                          )}
                        />
                      </Pressable>
                    )
                  ) : null}
                </View>
              )
            })}
          </ScrollView>
        ) : null}
      </View>
      {urls.length > 1 ? (
        <View style={styles.controls}>
          {renderStep(-1)}
          <Text accessibilityLiveRegion="polite" style={styles.position}>
            {`${current + 1} of ${urls.length}`}
          </Text>
          {renderStep(1)}
        </View>
      ) : null}
    </View>
  )
}
