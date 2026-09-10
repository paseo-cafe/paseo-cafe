import { z } from "zod"

export const SECURITY_RESULT_VERSION = 1 as const

export const REPORT_DETAILS_OPEN = "\uE000paseo-details-open\uE001"
export const REPORT_DETAILS_CLOSE = "\uE000paseo-details-close\uE001"
export const REPORT_SUMMARY_OPEN = "\uE000paseo-summary-open\uE001"
export const REPORT_SUMMARY_CLOSE = "\uE000paseo-summary-close\uE001"

export const securityFindingSchema = z
  .object({
    tool: z.string(),
    ruleId: z.string(),
    severity: z.string(),
    blocking: z.boolean(),
    path: z.string(),
    line: z.number().int().positive().optional(),
    message: z.string(),
  })
  .strict()

export type SecurityFinding = z.infer<typeof securityFindingSchema>

export type SecurityTarget = {
  id: string
  repo: string
  path?: string
  ref: string
  commit: string
}

export const securityPluginResultSchema = z
  .object({
    commit: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{40}$/i, "Must be a full Git commit SHA")
      .transform((commit) => commit.toLowerCase()),
    scannedAt: z.string().datetime(),
    status: z.enum(["passed", "failed", "unavailable"]),
    blockingFindings: z.number().int().nonnegative(),
    advisoryFindings: z.number().int().nonnegative(),
    coverage: z.object({
      files: z.number().int().nonnegative(),
      bytes: z.number().int().nonnegative(),
    }),
    buildCommands: z.array(z.array(z.string())),
    findings: z.array(securityFindingSchema),
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.status === "passed" && result.blockingFindings > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blockingFindings"],
        message: 'status "passed" cannot have blocking findings',
      })
    }
  })

export type SecurityPluginResult = z.infer<typeof securityPluginResultSchema>

export const securityResultsSchema = z
  .object({
    version: z.literal(SECURITY_RESULT_VERSION),
    generatedAt: z.string().datetime(),
    plugins: z.record(z.string(), securityPluginResultSchema),
  })
  .strict()

export type SecurityResults = z.infer<typeof securityResultsSchema>
