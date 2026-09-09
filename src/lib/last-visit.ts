/**
 * The "when was this browser last here?" bookkeeping behind the home page's
 * "new since your last visit" filter. Storage access lives in the hook
 * (src/hooks/use-last-visit.ts); the decision itself is here so it can be
 * tested without a DOM.
 */

/** Previous-visit timestamp, kept across visits. */
export const LAST_VISIT_KEY = "paseo-cafe:last-visit"
/** The reference this tab session is diffing against, pinned so a reload doesn't move the goalposts. */
export const SESSION_REF_KEY = "paseo-cafe:visit-ref"
/** Pinned when there was no previous visit — tells "first visit, already recorded" apart from "not recorded yet". */
export const NO_PREVIOUS_VISIT = ""

export interface VisitResolution {
  /** ISO timestamp to diff the catalog against, or null on a first visit. */
  lastVisit: string | null
  /** True the first time a tab session sees the site: the caller should pin the reference and stamp a fresh visit. */
  isNewSession: boolean
}

/**
 * Decides which timestamp this page load should treat as "last visit", given
 * the reference pinned for the tab session and the timestamp stored across
 * visits. The pinned value always wins: within one tab session, reloading or
 * navigating back to the listing must keep showing the same set of new
 * plugins rather than clearing it because the visit was just recorded.
 */
export function resolveVisit(
  pinned: string | null,
  previous: string | null
): VisitResolution {
  if (pinned !== null) {
    return {
      lastVisit: pinned === NO_PREVIOUS_VISIT ? null : pinned,
      isNewSession: false,
    }
  }
  return { lastVisit: previous, isNewSession: true }
}
