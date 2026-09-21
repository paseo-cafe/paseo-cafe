import { CopyCommand } from "@/components/copy-command"
import { getInstallCommand } from "@/lib/install-command"
import type { PluginRecord } from "@/lib/plugin-schema"

/** "Try the plugin" install prompt for the site's own paseo-cafe plugin. */
export function InstallCallout({ plugin }: { plugin: PluginRecord }) {
  const command = getInstallCommand(plugin)
  if (!command) return null
  return (
    <div className="mx-auto flex w-full flex-col gap-group">
      <h2 className="type-subheading text-center">Try the plugin</h2>
      <CopyCommand command={command} className="mx-auto w-full sm:w-fit" />
    </div>
  )
}
