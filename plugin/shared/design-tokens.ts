/**
 * Design tokens shared by the website and the companion plugin.
 *
 * Like `catalog.ts`, this module is dependency-free (no React, no Paseo SDK,
 * no DOM, no Node) so both consumers import it directly:
 *
 * - The website receives it as CSS. `bun run tokens:build` writes
 *   `src/design-tokens.css` (Tailwind spacing/icon variables and `type-*`
 *   utilities) from this file, and a test fails if the committed CSS drifts.
 *   Never hand-edit the CSS.
 * - The plugin imports the numbers and builds React Native styles from them.
 *
 * Tokens are named for the job they do, not their size, so a component asks
 * "how far apart are a label and its chips?" (`SPACE.group`) instead of
 * picking a number. Values are px on a 4px grid, plus a 2px hairline and a
 * 6px chip step — which is Tailwind's default spacing scale, so existing
 * numeric utilities and these roles line up.
 *
 * Colors are deliberately not here: the website owns its palette
 * (`src/styles.css`) and the plugin follows the host Paseo theme. The shared
 * rule is the *role*: `foreground` for content, `foregroundMuted`
 * (`text-muted-foreground`) for everything secondary — no third tier.
 */

/** Spacing roles, in px. On the web: `gap-chip`, `p-base`, `mt-section`, … */
export const SPACE = {
  /** Vertical padding of a badge or chip. */
  hair: 2,
  /** Icon ↔ text inside a badge, button, or inline link. */
  inline: 4,
  /** Between chips, badges, and inline meta items. */
  chip: 6,
  /** A label and what it labels; rows in a tight list; padding of a small tile. */
  group: 8,
  /** Between sibling controls or tiles; padding of a compact surface. */
  stack: 12,
  /** Padding of a surface; between blocks inside one section. */
  base: 16,
  /** Between page sections and between page-level regions. */
  section: 32,
} as const

export type SpaceRole = keyof typeof SPACE

/** Icon sizes, in px. On the web: `size-icon-md`. Unsized icons default to `md`. */
export const ICON = {
  /** Inside badges and `text-xs` metadata. */
  sm: 14,
  /** The default: next to body text and inside controls. */
  md: 16,
  /** Empty-state and placeholder art. */
  lg: 24,
  /** Overlay glyphs, such as the play button over a video poster. */
  xl: 32,
} as const

export type IconSize = keyof typeof ICON

/** Every bordered surface uses one hairline. */
export const BORDER_WIDTH = 1

/** The Cafe look is flat: controls, badges, and surfaces are square. */
export const CONTROL_RADIUS = 0

export type FontWeight = 400 | 500 | 600

export interface TypeStyle {
  /** px */
  size: number
  /** px */
  lineHeight: number
  weight: FontWeight
  /** em — multiply by `size` for a React Native `letterSpacing`. */
  tracking: number
  uppercase: boolean
}

/**
 * Type roles. Every piece of text on either surface is one of these; only the
 * color (foreground or muted) is chosen separately. On the web: `type-heading`.
 */
export const TYPE = {
  /** Hero h1 on the home and themes pages. */
  display: {
    size: 36,
    lineHeight: 40,
    weight: 600,
    tracking: -0.025,
    uppercase: false,
  },
  /** Page h1: plugin, submit, user, not-found. */
  title: {
    size: 24,
    lineHeight: 32,
    weight: 600,
    tracking: -0.025,
    uppercase: false,
  },
  /** Section h2. */
  heading: {
    size: 18,
    lineHeight: 28,
    weight: 600,
    tracking: -0.025,
    uppercase: false,
  },
  /** h3 and small callout titles. */
  subheading: {
    size: 16,
    lineHeight: 24,
    weight: 600,
    tracking: -0.025,
    uppercase: false,
  },
  /** Intro paragraphs under a title. */
  lead: {
    size: 16,
    lineHeight: 24,
    weight: 400,
    tracking: 0,
    uppercase: false,
  },
  /** Default running text. */
  body: {
    size: 14,
    lineHeight: 20,
    weight: 400,
    tracking: 0,
    uppercase: false,
  },
  /** Card titles, list-row names, and control labels. */
  label: {
    size: 14,
    lineHeight: 20,
    weight: 500,
    tracking: 0,
    uppercase: false,
  },
  /** Descriptions, badges, footnotes, and other supporting text. */
  meta: {
    size: 12,
    lineHeight: 18,
    weight: 400,
    tracking: 0,
    uppercase: false,
  },
  /** Uppercase group labels such as "Sort" or "Categories". */
  eyebrow: {
    size: 12,
    lineHeight: 16,
    weight: 500,
    tracking: 0.05,
    uppercase: true,
  },
} as const satisfies Record<string, TypeStyle>

export type TypeRole = keyof typeof TYPE
