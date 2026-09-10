export type InstallReportingUpdate = "saved" | "save-failed" | "sync-failed"

/** Persists the preference before synchronizing daemon-side report delivery. */
export async function updateInstallReportingPreference(
  enabled: boolean,
  save: (enabled: boolean) => Promise<boolean>,
  synchronize: (enabled: boolean) => Promise<unknown>
): Promise<InstallReportingUpdate> {
  if (!(await save(enabled))) return "save-failed"
  try {
    await synchronize(enabled)
  } catch {
    return "sync-failed"
  }
  return "saved"
}
