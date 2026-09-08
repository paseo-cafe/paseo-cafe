export const SECURITY_RESULT_VERSION = 1 as const

export type SecurityFinding = {
  tool: string
  ruleId: string
  severity: string
  blocking: boolean
  path: string
  line?: number
  message: string
}

export type PluginSecurityPluginResult = {
  commit: string
  scannedAt: string
  status: "passed" | "review-required" | "failed" | "unavailable"
  blockingFindings: number
  advisoryFindings: number
  coverage: { files: number; bytes: number }
  buildCommands: string[][]
  findings: SecurityFinding[]
}

export type SecurityResults = {
  version: typeof SECURITY_RESULT_VERSION
  generatedAt: string
  plugins: Record<string, PluginSecurityPluginResult>
}

export type SecurityTarget = {
  id: string
  repo: string
  ref: string
  commit: string
  path?: string
}
