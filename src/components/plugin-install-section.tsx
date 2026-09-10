import { CopyCommand } from "@/components/copy-command"
import { getInstallCommand } from "@/lib/install-command"
import type { PluginRecord } from "@/lib/plugin-schema"

export function PluginInstallSection({ plugin }: { plugin: PluginRecord }) {
  return (
    <div>
      <h2 className="mb-2 font-medium text-foreground/60 text-sm">Install</h2>
      <CopyCommand command={getInstallCommand(plugin)} />
    </div>
  )
}
