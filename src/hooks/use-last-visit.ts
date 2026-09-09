import { useEffect, useState } from "react"
import {
  LAST_VISIT_KEY,
  NO_PREVIOUS_VISIT,
  resolveVisit,
  SESSION_REF_KEY,
} from "@/lib/last-visit"

export interface LastVisit {
  /** ISO timestamp of the visitor's previous visit, or null on a first visit / when storage is unavailable. */
  lastVisit: string | null
  /** False until the effect has run. The site is prerendered, so the first render may not depend on storage. */
  ready: boolean
}

/**
 * Remembers when this browser last saw the site and reports the previous
 * value, so callers can diff the catalog against it. Entirely client-side —
 * a static site has no idea who is visiting, and this keeps it that way.
 */
export function useLastVisit(): LastVisit {
  const [state, setState] = useState<LastVisit>({
    lastVisit: null,
    ready: false,
  })

  useEffect(() => {
    try {
      const { lastVisit, isNewSession } = resolveVisit(
        sessionStorage.getItem(SESSION_REF_KEY),
        localStorage.getItem(LAST_VISIT_KEY)
      )
      if (isNewSession) {
        sessionStorage.setItem(SESSION_REF_KEY, lastVisit ?? NO_PREVIOUS_VISIT)
        localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString())
      }
      setState({ lastVisit, ready: true })
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). A visitor
      // we can't remember simply never sees the "new since last visit" filter.
      setState({ lastVisit: null, ready: true })
    }
  }, [])

  return state
}
