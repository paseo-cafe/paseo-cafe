export type InstallReportingUpdate = "saved" | "save-failed" | "cancel-failed"

/** Persists the preference before acknowledging cancellation of in-flight reports. */
export async function updateInstallReportingPreference(
  enabled: boolean,
  save: (enabled: boolean) => Promise<boolean>,
  cancel: () => Promise<unknown>
): Promise<InstallReportingUpdate> {
  if (!(await save(enabled))) return "save-failed"
  if (!enabled) {
    try {
      await cancel()
    } catch {
      return "cancel-failed"
    }
  }
  return "saved"
}
