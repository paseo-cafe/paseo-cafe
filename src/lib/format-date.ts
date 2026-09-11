import { formatCatalogDate } from "../../plugin/shared/catalog"

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

/**
 * `toLocaleDateString()`/`toLocaleString()` depend on the runtime's ICU data
 * and locale, which can (and did) differ between the Node SSR render and the
 * browser hydrating it, producing a React hydration mismatch. The shared
 * formatter in plugin/shared/catalog.ts builds dates by hand from UTC fields
 * instead, so the output is identical everywhere — and identical to the date
 * the companion plugin renders for the same listing. An unparseable value is
 * echoed back rather than rendered as "NaN NaN NaN".
 */
export function formatDate(iso: string): string {
  return formatCatalogDate(iso) ?? iso
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDate(iso)}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}
