import { IconCheck, IconX } from "@tabler/icons-react"
import { ExpandableSection } from "@/components/expandable-section"
import type { PluginHealth } from "@/lib/plugin-schema"
import {
  CATALOG_HEALTH_KEYS,
  CATALOG_HEALTH_LABELS,
} from "../../plugin/shared/catalog"

export const HEALTH_LABELS: Record<keyof PluginHealth, string> =
  CATALOG_HEALTH_LABELS

const HEALTH_KEYS =
  CATALOG_HEALTH_KEYS satisfies readonly (keyof PluginHealth)[]

export function PluginHealthChecks({ health }: { health: PluginHealth }) {
  const passedCount = HEALTH_KEYS.filter((key) => health[key]).length

  return (
    <ExpandableSection
      title="Health checks"
      subtitle={`${passedCount}/${HEALTH_KEYS.length} passed`}
    >
      <ul className="flex flex-col gap-group">
        {HEALTH_KEYS.map((key) => (
          <li key={key} className="type-body flex items-center gap-group">
            {health[key] ? (
              <IconCheck className="text-green-600" />
            ) : (
              <IconX className="text-muted-foreground/60" />
            )}
            <span className={health[key] ? "" : "text-muted-foreground"}>
              {HEALTH_LABELS[key]}
            </span>
          </li>
        ))}
      </ul>
    </ExpandableSection>
  )
}
