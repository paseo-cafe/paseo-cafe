import { useCallback, useLayoutEffect, useRef } from "react"

/** Where a list the reader is inside lands: just under the sticky header. */
const STICKY_TOP = 80

/** An anchor further down than this means the reader isn't reading it yet. */
const HOLD_WITHIN = 160

/**
 * Keeps the results list where the reader is looking while the content above
 * it appears or disappears.
 *
 * Filtering hides the Themes/Popular/Recent sections that sit above the list,
 * so without help a reader deep in the results is left staring at the footer
 * (the page got shorter) or at the featured sections (they came back). Call
 * `capture()` in the handler that starts the navigation; once `changeKey`
 * changes, the layout effect scrolls so the list starts where it did — or
 * just under the header if the reader had scrolled past its start.
 *
 * It does nothing while the list is still lower on the screen. A reader
 * clicking filters from the top of the page hasn't moved the sidebar yet, and
 * scrolling then would make the very control they used jump.
 */
export function useScrollAnchor<T extends HTMLElement>(changeKey: string) {
  const anchorRef = useRef<T>(null)
  const capturedTop = useRef<number | null>(null)

  const capture = useCallback(() => {
    capturedTop.current = anchorRef.current?.getBoundingClientRect().top ?? null
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: changeKey is the trigger; the effect reads only refs.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const before = capturedTop.current
    capturedTop.current = null
    if (!anchor || before === null || before >= HOLD_WITHIN) return

    const delta =
      anchor.getBoundingClientRect().top - Math.max(before, STICKY_TOP)
    if (Math.abs(delta) >= 1) window.scrollBy(0, delta)
  }, [changeKey])

  return { anchorRef, capture }
}
