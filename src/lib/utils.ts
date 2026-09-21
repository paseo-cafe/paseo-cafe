import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { ICON, SPACE, TYPE } from "../../plugin/shared/design-tokens"

// Teach tailwind-merge the design-token vocabulary (see AGENTS.md → "Design
// system") so a caller's `gap-chip` replaces a component's `gap-2` instead of
// both surviving and the stylesheet's source order deciding the winner.
const twMerge = extendTailwindMerge<"type-role">({
  extend: {
    theme: {
      spacing: [
        ...Object.keys(SPACE),
        ...Object.keys(ICON).map((size) => `icon-${size}`),
      ],
    },
    classGroups: {
      // A `type-*` role sets size, line height, weight, and tracking together.
      "type-role": [{ type: Object.keys(TYPE) }],
    },
    conflictingClassGroups: {
      "type-role": ["font-size", "font-weight", "leading", "tracking"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
