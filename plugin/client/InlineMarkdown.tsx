import type { PluginTheme } from "@getpaseo/plugin"
import { useMemo } from "react"
import { Text, type TextStyle } from "react-native"
import type {
  InlineMarkdownNode,
  InlineMarkdownTextNode,
} from "../shared/inline-markdown"
import { MONO_FONT } from "./visual"
import { openExternal } from "./web"

interface InlineMarkdownProps {
  nodes: readonly InlineMarkdownNode[]
  theme: PluginTheme
  /**
   * Base text style; node styling layers on top of it. Omit it when this
   * sits inside a styled Text, which React Native already inherits from.
   */
  style?: TextStyle
  /**
   * "text" keeps link labels as unpressable text, for rows that are
   * themselves one big Pressable, where a nested press target would
   * steal the row's own tap and send the reader somewhere they didn't aim.
   */
  links?: "press" | "text"
  numberOfLines?: number
}

/**
 * Renders the inline markdown authors write in catalog text (links, bold,
 * italic, code) from the nodes the catalog already carries
 * (../shared/inline-markdown.ts). Nothing is parsed here: the registry
 * projects the markdown ahead of time, and the website's own
 * src/components/inline-markdown.tsx renders the very same nodes as DOM.
 */
export function InlineMarkdown({
  nodes,
  theme,
  style,
  links = "press",
  numberOfLines,
}: InlineMarkdownProps) {
  const styles = useMemo(
    () => ({
      link: {
        color: theme.colors.foreground,
        textDecorationLine: "underline" as const,
      },
      code: {
        backgroundColor: theme.colors.surface2,
        fontFamily: MONO_FONT,
      },
      strong: { fontWeight: "700" as const },
      emphasis: { fontStyle: "italic" as const },
    }),
    [theme]
  )

  const runStyle = (node: InlineMarkdownTextNode) => [
    node.code ? styles.code : null,
    node.strong ? styles.strong : null,
    node.emphasis ? styles.emphasis : null,
  ]

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {nodes.map((node, index) =>
        node.type === "text" ? (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: Nodes are positional; the same text can legitimately repeat.
            key={index}
            style={runStyle(node)}
          >
            {node.text}
          </Text>
        ) : (
          // One press target per link, however many styled runs its label holds.
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: Nodes are positional; the same text can legitimately repeat.
            key={index}
            style={links === "press" ? styles.link : null}
            accessibilityRole={links === "press" ? "link" : undefined}
            onPress={
              links === "press" ? () => openExternal(node.href) : undefined
            }
          >
            {node.children.map((child, childIndex) => (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: Nodes are positional; the same text can legitimately repeat.
                key={childIndex}
                style={runStyle(child)}
              >
                {child.text}
              </Text>
            ))}
          </Text>
        )
      )}
    </Text>
  )
}
