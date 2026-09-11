import { useEffect, useState } from "react"
import {
  formatCatalogDate,
  formatCatalogDateForReader,
} from "../../plugin/shared/catalog"

/**
 * A catalog date rendered in the reader's own locale and time zone.
 *
 * Neither is knowable during the server render, and formatting a date through
 * Intl on the server and again in the browser is exactly the hydration
 * mismatch this site hit before (see src/lib/format-date.ts). So both passes
 * render the same locale-independent UTC form, and an effect — which only
 * runs in the browser, after hydration has matched — swaps in the reader's
 * rendering. Readers without JavaScript keep the UTC form, which is still a
 * correct, readable date rather than an empty space.
 *
 * The machine-readable value stays in `dateTime` either way.
 */
export function ReaderDate({ iso }: { iso: string }) {
  const [text, setText] = useState(() => formatCatalogDate(iso) ?? iso)

  useEffect(() => {
    setText(formatCatalogDateForReader(iso) ?? iso)
  }, [iso])

  return <time dateTime={iso}>{text}</time>
}
