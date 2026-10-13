import type { PluginTheme } from "@getpaseo/plugin"
import { useMemo, useState } from "react"
import { Image, Text, View } from "react-native"
import type { DirectoryEntry } from "../shared/directory"
import { radius } from "./visual"

interface PluginIconProps {
  entry: Pick<DirectoryEntry, "name" | "icon">
  theme: PluginTheme
  size: number
}

/** The listing's icon, or its initial on a neutral tile when it has none or the image fails to load. */
export function PluginIcon({ entry, theme, size }: PluginIconProps) {
  const [failedIcon, setFailedIcon] = useState<string | undefined>()
  const styles = useMemo(
    () => ({
      box: {
        width: size,
        height: size,
        borderRadius: radius.md,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        overflow: "hidden" as const,
        backgroundColor: theme.colors.surface2,
      },
      image: { width: size, height: size },
      initial: {
        color: theme.colors.foreground,
        fontSize: Math.round(size * 0.45),
        fontWeight: "600" as const,
      },
    }),
    [theme, size]
  )
  const initial = Array.from(entry.name.trim())[0]?.toUpperCase() ?? "?"
  // A failure is remembered per URL, so a different icon is tried again.
  const showImage = Boolean(entry.icon) && entry.icon !== failedIcon

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.box}
    >
      {showImage ? (
        <Image
          accessible={false}
          source={{ uri: entry.icon }}
          style={styles.image}
          onError={() => setFailedIcon(entry.icon)}
        />
      ) : (
        <Text style={styles.initial}>{initial}</Text>
      )}
    </View>
  )
}
