import { describe, expect, it } from "vitest"
import { pluginSecuritySchema } from "../src/lib/plugin-schema"
import { securityForRevision } from "./scan"

const REVISION = "0123456789abcdef0123456789abcdef01234567"
const OTHER_REVISION = "fedcba9876543210fedcba9876543210fedcba98"

function security(status: "passed" | "failed" | "unknown") {
  return pluginSecuritySchema.parse({
    status,
    blockingFindings: status === "failed" ? 1 : 0,
    advisoryFindings: 0,
    commit: status === "unknown" ? undefined : REVISION,
  })
}

describe("securityForRevision", () => {
  it("attaches passed and failed results only to their scanned revision", () => {
    for (const status of ["passed", "failed"] as const) {
      const result = security(status)
      expect(securityForRevision(result, REVISION)).toBe(result)
      expect(securityForRevision(result, OTHER_REVISION)).toBeUndefined()
    }
  })

  it("normalizes the repository revision before matching", () => {
    const result = security("passed")
    expect(securityForRevision(result, `  ${REVISION.toUpperCase()}  `)).toBe(
      result
    )
  })

  it("preserves an unknown result without treating it as an attestation", () => {
    const result = security("unknown")
    expect(securityForRevision(result, OTHER_REVISION)).toBe(result)
  })
})
