import { IconAlertTriangle } from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { PluginRecord } from "@/lib/plugin-schema"
import { PLATFORM_LABELS } from "@/lib/registry-schema"

export function PluginCaveatsAlert({ plugin }: { plugin: PluginRecord }) {
  const hasCaveats = plugin.platforms.length > 0 || plugin.caveats.length > 0

  if (!hasCaveats) return null

  return (
    <Alert>
      <IconAlertTriangle />
      <AlertTitle>Caveats</AlertTitle>
      <AlertDescription>
        {plugin.platforms.length > 0 ? (
          <p>
            <strong className="text-foreground">Supported platforms:</strong>{" "}
            {plugin.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")}.
          </p>
        ) : null}
        {plugin.caveats.length > 0 ? (
          <ul className="list-disc pl-4">
            {plugin.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
