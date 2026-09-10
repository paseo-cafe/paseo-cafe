import { useSettings } from "@getpaseo/plugin/client"
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
import { DEFAULT_DIRECTORY_URL, directorySettings } from "../shared/directory"

export function DirectorySettings() {
  const settings = useSettings(directorySettings)
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<SettingsInputHandle>(null)

  if (settings.status === "loading") return null

  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <SettingsSection title="Paseo Cafe">
        <SettingsRow label="Catalog URL" error={settings.error} />
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
  const currentUrl = draft ?? values.directoryUrl
  const dirty = currentUrl !== values.directoryUrl

  async function apply(url: string) {
    const ok = await saveSettings({ directoryUrl: url }, revision)
    if (ok) {
      setDraft(null)
      inputRef.current?.replaceText(url)
      toast.show("Paseo Cafe settings saved.", { variant: "success" })
    } else {
      toast.error("Failed to save Paseo Cafe settings.")
    }
  }

  function reset() {
    inputRef.current?.replaceText(DEFAULT_DIRECTORY_URL)
    setDraft(DEFAULT_DIRECTORY_URL)
    void apply(DEFAULT_DIRECTORY_URL)
  }

  return (
    <SettingsSection
      title="Paseo Cafe"
      info="Point this at another deployment of paseo.cafe — a local `bun run dev`, a staging build, or a self-hosted fork — that serves the same /api/plugins shape. The catalog picks what the install button hands to the paseo CLI, so it must be HTTPS unless it is on localhost."
    >
      <SettingsCard>
        <SettingsInput
          ref={inputRef}
          label="Catalog URL"
          hint="HTTPS, or HTTP on localhost — e.g. http://localhost:3000/api/plugins"
          error={saveError}
          initialValue={values.directoryUrl}
          placeholder={DEFAULT_DIRECTORY_URL}
          onChangeText={setDraft}
          disabled={saving}
        />
        <SettingsAction
          label="Apply"
          actionLabel={saving ? "Saving…" : "Save"}
          disabled={saving || !dirty}
          onPress={() => void apply(currentUrl)}
        />
        <SettingsAction
          label="Default"
          actionLabel="Reset to paseo.cafe"
          disabled={saving || currentUrl === DEFAULT_DIRECTORY_URL}
          onPress={reset}
        />
      </SettingsCard>
    </SettingsSection>
  )
}
