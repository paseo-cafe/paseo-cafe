import { DEPRECATION_SUNSET, OFFICIAL_DIRECTORY_URL } from "@/lib/site"
import { SUBMIT_URL } from "../../plugin/shared/catalog"

export function DeprecationBanner() {
  return (
    <div
      role="note"
      className="border-border/60 border-b bg-muted px-6 py-2 text-center text-sm"
    >
      paseo.cafe is deprecated. Browse plugins at{" "}
      <a className="underline" href={OFFICIAL_DIRECTORY_URL}>
        paseo.sh/plugins
      </a>{" "}
      and{" "}
      <a className="underline" href={SUBMIT_URL}>
        submit new ones there
      </a>
      . This catalog and its API stop on {DEPRECATION_SUNSET}. The Paseo Cafe
      companion plugin already uses the official registry and is unaffected.
    </div>
  )
}
