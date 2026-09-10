import { useEffect, useState } from "react"
import {
  formatDate,
  formatDateLocalized,
  formatDateTime,
  formatDateTimeLocalized,
} from "@/lib/format-date"

/**
 * A date in the reader's own format. Every page here is prerendered, and
 * Intl's output depends on the runtime's locale and ICU data — so the server
 * render and the browser would disagree and React would report a hydration
 * mismatch (see the note in src/lib/format-date.ts). This renders the
 * deterministic UTC format first, matching the prerendered HTML exactly, and
 * localizes in an effect once only the browser is doing the formatting.
 *
 * The <time> element carries the raw timestamp either way, so crawlers and
 * readers without JavaScript still get a machine-readable date.
 */
function Formatted({
  iso,
  format,
  localize,
}: {
  iso: string
  format: (iso: string) => string
  localize: (iso: string) => string
}) {
  const [text, setText] = useState(() => format(iso))

  useEffect(() => {
    setText(localize(iso))
  }, [iso, localize])

  return <time dateTime={iso}>{text}</time>
}

/** e.g. "9 Jan 2026", "Jan 9, 2026", "2026年1月9日" — always the UTC calendar day. */
export function LocalDate({ iso }: { iso: string }) {
  return (
    <Formatted iso={iso} format={formatDate} localize={formatDateLocalized} />
  )
}

/** Same, with the time of day, which stays on and is labelled UTC. */
export function LocalDateTime({ iso }: { iso: string }) {
  return (
    <Formatted
      iso={iso}
      format={formatDateTime}
      localize={formatDateTimeLocalized}
    />
  )
}
