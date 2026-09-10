import { CopyCommand } from "@/components/copy-command"
import { getInstallCommand } from "@/lib/install-command"
import type { PluginRecord } from "@/lib/plugin-schema"

/** "Try the plugin" install prompt for the site's own paseo-cafe plugin. */
export function InstallCallout({ plugin }: { plugin: PluginRecord }) {
  return (
    <div className="mx-auto w-full">
      <h2 className="text-center font-semibold tracking-tight">
        Try the plugin
      </h2>
      <CopyCommand
        command={getInstallCommand(plugin)}
        className="mx-auto w-full sm:w-fit"
      />
    </div>
  )
}
