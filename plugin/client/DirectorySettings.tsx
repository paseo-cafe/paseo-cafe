import { useSettings } from "@getpaseo/plugin/client"
import { useToast } from "@getpaseo/plugin/client/react-native"
import {
  SettingsAction,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui"
import { useState } from "react"
import { DEFAULT_DIRECTORY_URL, directorySettings } from "../shared/directory"

export function DirectorySettings() {
  const settings = useSettings(directorySettings)
  const toast = useToast()
  const [draft, setDraft] = useState<string | null>(null)

  if (settings.status === "loading") return null

  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <SettingsSection title="Plugin Directory">
        <SettingsRow
          label="Directory URL"
          error="Couldn't load this plugin's settings."
        />
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
      toast.show("Saved. Reopen the Plugin Directory to pick it up.")
    } else {
      toast.error(saveError ?? "Failed to save.")
    }
  }

  return (
    <SettingsSection
      title="Plugin Directory"
      info="Point this at another deployment of paseo.cafe — a local `npm run dev`, a staging build, or a self-hosted fork — that serves the same /api/plugins shape."
    >
      <SettingsInput
        label="Directory URL"
        hint="e.g. http://localhost:3000/api/plugins"
        initialValue={values.directoryUrl}
        placeholder={DEFAULT_DIRECTORY_URL}
        onChangeText={setDraft}
        disabled={saving}
      />
      <SettingsAction
        label="Apply"
        actionLabel={saving ? "Saving…" : "Save"}
        disabled={saving || !dirty}
        onPress={() => apply(currentUrl)}
      />
      <SettingsAction
        label="Default"
        actionLabel="Reset to paseo.cafe"
        disabled={saving || values.directoryUrl === DEFAULT_DIRECTORY_URL}
        onPress={() => apply(DEFAULT_DIRECTORY_URL)}
      />
    </SettingsSection>
  )
}
