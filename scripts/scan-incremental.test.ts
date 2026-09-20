import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { PluginRecord } from "../src/lib/plugin-schema"
import { assembleIncrementalCatalog } from "./scan"
import {
  type CandidateScanResults,
  gitTargetKey,
  type RegistryEntryWithId,
  type RegistryScanState,
  registryDigestForEntries,
  registryKey,
  registryScanStateSchema,
  type ScanPlan,
  sealScanPlan,
  sourceKey,
} from "./scan-plan"

const COMMIT = "1".repeat(40)
const DIGEST = "a".repeat(64)
const REGISTRY_ENTRY: RegistryEntryWithId = {
  id: "example",
  repo: "acme/example",
  categories: [],
  platforms: [],
  caveats: [],
}
const SOURCE_KEY = sourceKey(REGISTRY_ENTRY)
const REGISTRY_KEY = registryKey(REGISTRY_ENTRY)
const REGISTRY_DIGEST = registryDigestForEntries([REGISTRY_ENTRY])
const SCANNED_AT = "2026-09-20T00:00:00.000Z"
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function activeRecord(): PluginRecord {
  return {
    id: "example",
    repo: "acme/example",
    url: "https://github.com/acme/example",
    name: "example",
    description: "Released plugin",
    descriptionNodes: [{ type: "text", text: "Released plugin" }],
    version: "1.0.0",
    categories: [],
    platforms: [],
    caveats: [],
    caveatNodes: [],
    health: {
      manifestValid: true,
      hasReadme: true,
      hasLicense: true,
      hasTests: true,
      hasTypecheckScript: true,
      updatedRecently: true,
    },
    security: {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      commit: COMMIT,
      scannedAt: SCANNED_AT,
    },
    images: [],
    videos: [],
    scannedAt: SCANNED_AT,
  }
}

function unchangedPlan(withGitTarget = false): ScanPlan {
  const targetKey = gitTargetKey(REGISTRY_ENTRY, "2".repeat(40), DIGEST)
  return sealScanPlan({
    version: 1,
    needsAssembly: withGitTarget,
    mode: "full",
    generatedAt: SCANNED_AT,
    registryDigest: REGISTRY_DIGEST,
    catalogDigest: DIGEST,
    securityDigest: DIGEST,
    securityPolicyVersion: 1,
    reusedState: true,
    entries: [
      {
        registry: REGISTRY_ENTRY,
        sourceKey: SOURCE_KEY,
        registryKey: REGISTRY_KEY,
        observedGit: {
          targetKey,
          commit: "2".repeat(40),
          version: "1.0.0",
        },
        npmResolved: false,
        gitTarget: withGitTarget
          ? {
              targetKey,
              repo: "acme/example",
              commit: "2".repeat(40),
              version: "1.1.0",
            }
          : undefined,
        npmTargets: [],
        needsAssembly: withGitTarget,
      },
    ],
  })
}

function previousState(): RegistryScanState {
  return {
    version: 1,
    generatedAt: SCANNED_AT,
    registryDigest: REGISTRY_DIGEST,
    catalogDigest: DIGEST,
    securityDigest: DIGEST,
    securityPolicyVersion: 1,
    entries: {
      example: {
        sourceKey: SOURCE_KEY,
        registryKey: REGISTRY_KEY,
        active: activeRecord(),
      },
      removed: {
        sourceKey: "e".repeat(64),
        registryKey: "f".repeat(64),
        active: { ...activeRecord(), id: "removed", name: "removed" },
      },
    },
  }
}

function emptyCandidates(planId: string): CandidateScanResults {
  return {
    version: 1,
    planId,
    generatedAt: SCANNED_AT,
    plugins: {},
  }
}

describe("incremental catalog assembly", () => {
  it("retains the complete prior record and drops stale membership", async () => {
    const root = mkdtempSync(join(tmpdir(), "paseo-incremental-catalog-"))
    roots.push(root)
    const registryDir = join(root, "registry")
    const outputDir = join(root, "data", "plugins")
    const ogDir = join(root, "public", "og")
    const statePath = join(root, "data", "registry-scan-state.json")
    const indexPath = join(root, "data", "plugins.json")
    mkdirSync(registryDir, { recursive: true })
    mkdirSync(ogDir, { recursive: true })
    writeFileSync(
      join(registryDir, "example.json"),
      JSON.stringify({ repo: "acme/example" })
    )
    writeFileSync(join(ogDir, "example.png"), "existing")

    const plan = unchangedPlan()
    const result = await assembleIncrementalCatalog({
      plan,
      candidates: emptyCandidates(plan.planId),
      previousState: registryScanStateSchema.parse(previousState()),
      outputDir,
      ogDir,
      statePath,
      indexPath,
      writeDeploymentFiles: false,
    })

    expect(result).toEqual({ records: [activeRecord()], publishedCount: 0 })
    expect(JSON.parse(readFileSync(indexPath, "utf8"))).toEqual([
      activeRecord(),
    ])
    const state = JSON.parse(readFileSync(statePath, "utf8"))
    expect(Object.keys(state.entries)).toEqual(["example"])
    expect(state.entries.example.active.security.commit).toBe(COMMIT)
    expect(state.entries.example.active.scannedAt).toBe(SCANNED_AT)
  })

  it("rejects candidate results from another plan", async () => {
    const root = mkdtempSync(join(tmpdir(), "paseo-incremental-catalog-"))
    roots.push(root)

    await expect(
      assembleIncrementalCatalog({
        plan: unchangedPlan(),
        candidates: emptyCandidates("9".repeat(64)),
        previousState: previousState(),
        registryDir: join(root, "registry"),
        outputDir: join(root, "data", "plugins"),
        ogDir: join(root, "public", "og"),
        statePath: join(root, "data", "registry-scan-state.json"),
        indexPath: join(root, "data", "plugins.json"),
        writeDeploymentFiles: false,
      })
    ).rejects.toThrow("do not match the pinned plan")
  })
  it("rejects a result whose commit differs from its target", async () => {
    const plan = unchangedPlan(true)
    const targetKey = plan.entries[0].gitTarget?.targetKey
    if (!targetKey) throw new Error("missing Git target")

    await expect(
      assembleIncrementalCatalog({
        plan,
        candidates: {
          version: 1,
          planId: plan.planId,
          generatedAt: SCANNED_AT,
          plugins: {
            example: {
              git: {
                targetKey,
                result: {
                  commit: "9".repeat(40),
                  scannedAt: SCANNED_AT,
                  status: "passed",
                  blockingFindings: 0,
                  advisoryFindings: 0,
                  coverage: { files: 1, bytes: 1 },
                  buildCommands: [],
                  findings: [],
                },
              },
            },
          },
        },
        previousState: registryScanStateSchema.parse(previousState()),
        writeDeploymentFiles: false,
      })
    ).rejects.toThrow("candidate target mismatch")
  })

  it("retains the active release when a newer Git candidate fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "paseo-incremental-catalog-"))
    roots.push(root)
    const registryDir = join(root, "registry")
    const outputDir = join(root, "data", "plugins")
    const ogDir = join(root, "public", "og")
    const statePath = join(root, "data", "registry-scan-state.json")
    const indexPath = join(root, "data", "plugins.json")
    mkdirSync(registryDir, { recursive: true })
    mkdirSync(ogDir, { recursive: true })
    writeFileSync(
      join(registryDir, "example.json"),
      JSON.stringify({ repo: "acme/example" })
    )
    writeFileSync(join(ogDir, "example.png"), "existing")
    const plan = unchangedPlan(true)
    const targetKey = plan.entries[0].gitTarget?.targetKey
    if (!targetKey) throw new Error("missing Git target")
    const candidates: CandidateScanResults = {
      version: 1,
      planId: plan.planId,
      generatedAt: SCANNED_AT,
      plugins: {
        example: {
          git: {
            targetKey,
            result: {
              commit: "2".repeat(40),
              scannedAt: SCANNED_AT,
              status: "failed",
              blockingFindings: 1,
              advisoryFindings: 0,
              coverage: { files: 1, bytes: 1 },
              buildCommands: [],
              findings: [
                {
                  tool: "manifest",
                  ruleId: "missing",
                  severity: "high",
                  blocking: true,
                  path: ".",
                  message: "missing manifest",
                },
              ],
            },
          },
        },
      },
    }

    const result = await assembleIncrementalCatalog({
      plan,
      candidates,
      previousState: registryScanStateSchema.parse(previousState()),
      registryDir,
      outputDir,
      ogDir,
      statePath,
      indexPath,
      writeDeploymentFiles: false,
    })

    expect(result.records[0]?.version).toBe("1.0.0")
    expect(result.records[0]?.security?.commit).toBe(COMMIT)
    expect(result.publishedCount).toBe(0)
    const state = JSON.parse(readFileSync(statePath, "utf8"))
    expect(state.entries.example.lastAttempt.git).toMatchObject({
      targetKey,
      result: { status: "failed", commit: "2".repeat(40) },
    })
  })
})
