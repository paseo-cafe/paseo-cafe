import { CopyBlock } from "@/components/copy-block"
import { ExpandableSection } from "@/components/expandable-section"

export function PluginManifest({
  manifest,
}: {
  manifest?: Record<string, unknown>
}) {
  if (!manifest) return null

  return (
    <ExpandableSection title="Paseo manifest" subtitle="Pretty-printed JSON">
      <CopyBlock
        code={JSON.stringify(manifest, null, 2)}
        label="Manifest JSON"
      />
    </ExpandableSection>
  )
}
