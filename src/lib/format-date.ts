const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * `toLocaleDateString()`/`toLocaleString()` depend on the runtime's ICU data
 * and locale, which can (and did) differ between the Node SSR render and the
 * browser hydrating it, producing a React hydration mismatch. These format
 * dates by hand instead, using UTC fields, so the output is identical
 * everywhere regardless of server/browser locale or timezone.
 */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDate(iso)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/**
 * The same instants in the reader's own date format. Pinned to UTC so the
 * calendar day matches what the record, the API and the sitemap say — only the
 * presentation is localized, never which day it lands on.
 *
 * These depend on the runtime's locale and so must never run during the
 * prerender; render them after hydration via <LocalDate> (see
 * src/components/local-date.tsx), which falls back to the formats above.
 */
function localized(
  iso: string,
  locales: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions,
  fallback: (iso: string) => string
): string {
  const d = new Date(iso)
  // Intl throws on an invalid date, and a date we can't read is not worth
  // breaking a page over.
  if (Number.isNaN(d.getTime())) return fallback(iso)
  return new Intl.DateTimeFormat(locales, {
    ...options,
    timeZone: "UTC",
  }).format(d)
}

export function formatDateLocalized(
  iso: string,
  locales?: Intl.LocalesArgument
): string {
  return localized(
    iso,
    locales,
    { year: "numeric", month: "short", day: "numeric" },
    formatDate
  )
}

export function formatDateTimeLocalized(
  iso: string,
  locales?: Intl.LocalesArgument
): string {
  return localized(
    iso,
    locales,
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      // Times stay on UTC's clock, so say so rather than let it read as local.
      timeZoneName: "short",
    },
    formatDateTime
  )
}
