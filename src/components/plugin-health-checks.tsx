import { IconCheck, IconX } from "@tabler/icons-react"
import { ExpandableSection } from "@/components/expandable-section"
import type { PluginHealth } from "@/lib/plugin-schema"

export const HEALTH_LABELS: Record<keyof PluginHealth, string> = {
  manifestValid: "Manifest ID matches registry",
  hasReadme: "Has a README",
  hasLicense: "Has a license",
  hasTests: "Has tests",
  hasTypecheckScript: "Has a typecheck script",
  updatedRecently: "Updated in the last 6 months",
}

const HEALTH_KEYS = Object.keys(HEALTH_LABELS) as (keyof PluginHealth)[]

export function PluginHealthChecks({ health }: { health: PluginHealth }) {
  const passedCount = HEALTH_KEYS.filter((key) => health[key]).length

  return (
    <ExpandableSection
      title="Health checks"
      subtitle={`${passedCount}/${HEALTH_KEYS.length} passed`}
    >
      <ul className="flex flex-col gap-2">
        {HEALTH_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-2 text-sm">
            {health[key] ? (
              <IconCheck className="size-4 text-green-600" />
            ) : (
              <IconX className="size-4 text-foreground/30" />
            )}
            <span className={health[key] ? "" : "text-foreground/50"}>
              {HEALTH_LABELS[key]}
            </span>
          </li>
        ))}
      </ul>
    </ExpandableSection>
  )
}
