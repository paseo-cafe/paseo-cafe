import { useRpc, useSettings } from "@getpaseo/plugin/client"
import { useToast } from "@getpaseo/plugin/client/react-native"
import type { SettingsInputHandle } from "@getpaseo/plugin/client/ui"
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui"
import { useRef, useState } from "react"
import {
  DEFAULT_REGISTRY_URL,
  directoryRunAutomaticUpdatesRpc,
  directorySettings,
  isTrustedRegistryUrl,
  registryBase,
} from "../shared/directory"
import { summarizeAutomaticUpdates } from "./update-status"

const REGISTRY_INFO =
  "Paseo Cafe browses the official Paseo plugin directory. To browse another registry, it must serve the Paseo registry protocol v1 documents (index.json and plugins/<owner>/<slug>.json) over HTTPS, or HTTP on localhost. The registry decides what the paseo CLI installs, so only use one you trust. Installing from a custom registry also needs an HTTPS URL without a path."

export function DirectorySettings() {
  const settings = useSettings(directorySettings)
  const runAutomaticUpdates = useRpc(directoryRunAutomaticUpdatesRpc)
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<SettingsInputHandle>(null)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  if (settings.status === "loading") return null

  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <SettingsSection title="Paseo Cafe">
        <SettingsRow label="Registry URL" error={settings.error} />
        <SettingsAction
          label="Try again"
          actionLabel="Reload"
          onPress={settings.reload}
        />
        {settings.status === "invalid" ? (
          <SettingsAction
            label="Restore default settings"
            actionLabel="Reset"
            onPress={settings.reset}
          />
        ) : null}
      </SettingsSection>
    )
  }

  // Destructured once, right after narrowing: TypeScript doesn't carry
  // `settings.status === "ready"` narrowing into a closure defined below, but
  // these individual bindings keep their (already-narrowed) types fine.
  const { values, revision, saving, saveError, save: saveSettings } = settings
  const currentUrl = draft ?? values.registryUrl
  const urlValid = isTrustedRegistryUrl(currentUrl)
  const dirty = registryBase(currentUrl) !== registryBase(values.registryUrl)
  const usingOfficialRegistry =
    registryBase(currentUrl) === DEFAULT_REGISTRY_URL &&
    registryBase(values.registryUrl) === DEFAULT_REGISTRY_URL

  async function apply(url: string) {
    const registryUrl = registryBase(url)
    const ok = await saveSettings({ ...values, registryUrl }, revision)
    if (ok) {
      setDraft(null)
      inputRef.current?.replaceText(registryUrl)
      toast.show("Paseo Cafe settings saved.", { variant: "success" })
    } else {
      toast.error("Failed to save Paseo Cafe settings.")
    }
  }

  function reset() {
    inputRef.current?.replaceText(DEFAULT_REGISTRY_URL)
    setDraft(DEFAULT_REGISTRY_URL)
    void apply(DEFAULT_REGISTRY_URL)
  }

  async function runUpdatesNow() {
    setCheckingUpdates(true)
    try {
      const { outcomes } = await runAutomaticUpdates({})
      const summary = summarizeAutomaticUpdates(outcomes)
      if (summary.failed) toast.error(summary.message)
      else toast.show(summary.message, { variant: "success" })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Automatic update run failed."
      )
    } finally {
      setCheckingUpdates(false)
    }
  }

  return (
    <SettingsSection title="Paseo Cafe" info={REGISTRY_INFO}>
      <SettingsCard>
        <SettingsInput
          ref={inputRef}
          label="Registry URL"
          hint={`HTTPS, or HTTP on localhost. Official registry: ${DEFAULT_REGISTRY_URL}`}
          error={
            draft !== null && !urlValid
              ? "Use an HTTPS URL, or HTTP on localhost."
              : saveError
          }
          initialValue={values.registryUrl}
          placeholder={DEFAULT_REGISTRY_URL}
          onChangeText={setDraft}
          disabled={saving}
        />
        <SettingsAction
          label="Apply"
          actionLabel={saving ? "Saving…" : "Save"}
          disabled={saving || !dirty || !urlValid}
          onPress={() => void apply(currentUrl)}
        />
        <SettingsAction
          label="Default"
          actionLabel="Reset to official registry"
          disabled={saving || usingOfficialRegistry}
          onPress={reset}
        />
        <SettingsAction
          label="Run automatic updates now"
          hint="Installed plugins update on their own every 6 hours unless automatic updates are off for them. Run the check now instead of waiting."
          actionLabel={checkingUpdates ? "Running…" : "Run now"}
          disabled={checkingUpdates}
          onPress={() => void runUpdatesNow()}
        />
      </SettingsCard>
    </SettingsSection>
  )
}
