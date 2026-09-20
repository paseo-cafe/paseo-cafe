import { describe, expect, it, vi } from "vitest"
import type { PluginRecord } from "../src/lib/plugin-schema"
import {
  createScanPlan,
  type RegistryEntryWithId,
  type RegistryScanState,
  type ScanPlanResolvers,
  verifyScanPlan,
} from "./scan-plan"

const OLD_COMMIT = "1".repeat(40)
const NEW_COMMIT = "2".repeat(40)
const DIGEST = "a".repeat(64)
const INTEGRITY_1 = `sha512-${"a".repeat(86)}`
const INTEGRITY_2 = `sha512-${"b".repeat(86)}`
const PUBLISHED_AT = "2026-09-20T00:00:00.000Z"
const GIT_RESULT = {
  commit: NEW_COMMIT,
  scannedAt: PUBLISHED_AT,
  status: "passed" as const,
  blockingFindings: 0,
  advisoryFindings: 0,
  coverage: { files: 1, bytes: 1 },
  buildCommands: [],
  findings: [],
}

function record(
  id: string,
  repo: string,
  version: string,
  path?: string
): PluginRecord {
  return {
    id,
    repo,
    path,
    url: `https://github.com/${repo}`,
    name: id,
    description: "",
    descriptionNodes: [],
    version,
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
      commit: OLD_COMMIT,
    },
    images: [],
    videos: [],
    scannedAt: PUBLISHED_AT,
  }
}

function state(
  records: Record<string, PluginRecord>,
  attempts: RegistryScanState["entries"][string]["lastAttempt"] = undefined
): RegistryScanState {
  return {
    version: 1,
    registryDigest: DIGEST,
    generatedAt: PUBLISHED_AT,
    catalogDigest: DIGEST,
    securityDigest: DIGEST,
    securityPolicyVersion: 1,
    entries: Object.fromEntries(
      Object.entries(records).map(([id, active]) => [
        id,
        {
          sourceKey: "b".repeat(64),
          registryKey: "c".repeat(64),
          active,
          lastAttempt: attempts,
        },
      ])
    ),
  }
}

function resolvers(versions: Record<string, string>): ScanPlanResolvers {
  return {
    resolveCommit: vi.fn(async () => NEW_COMMIT),
    resolveGitVersion: vi.fn(async (entry) => versions[entry.path ?? "."]),
    resolveNpm: vi.fn(async () => ({})),
  }
}

const entry = (id: string, path?: string, packageName?: string) => ({
  id,
  repo: "acme/plugins",
  path,
  package: packageName,
  categories: [],
  platforms: [],
  caveats: [],
})

async function initialState(
  entries: RegistryEntryWithId[],
  records: Record<string, PluginRecord>,
  services: ScanPlanResolvers
): Promise<RegistryScanState> {
  const initial = await createScanPlan({
    entries,
    catalogDigest: DIGEST,
    securityDigest: DIGEST,
    resolvers: services,
  })
  const base = state(records)
  base.registryDigest = initial.registryDigest
  for (const planned of initial.entries) {
    const existing = base.entries[planned.registry.id]
    if (existing) {
      existing.sourceKey = planned.sourceKey
      existing.registryKey = planned.registryKey
    }
  }
  return base
}

describe("incremental scan planning", () => {
  it("ignores a monorepo head change when plugin versions are unchanged", async () => {
    const entries = [entry("plugin-a", "a"), entry("plugin-b", "b")]
    const services = resolvers({ a: "1.0.0", b: "2.0.0" })
    const records = {
      "plugin-a": record("plugin-a", "acme/plugins", "1.0.0", "a"),
      "plugin-b": record("plugin-b", "acme/plugins", "2.0.0", "b"),
    }
    const previousState = await initialState(entries, records, services)
    vi.mocked(services.resolveCommit).mockClear()
    vi.mocked(services.resolveGitVersion).mockClear()

    const plan = await createScanPlan({
      entries,
      previousState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })

    expect(plan.entries.every((planned) => !planned.gitTarget)).toBe(true)
    expect(plan.needsAssembly).toBe(false)
    expect(services.resolveCommit).toHaveBeenCalledTimes(1)
    expect(services.resolveGitVersion).toHaveBeenCalledTimes(2)
  })

  it("selects only the plugin whose package version increased", async () => {
    const entries = [entry("plugin-a", "a"), entry("plugin-b", "b")]
    const records = {
      "plugin-a": record("plugin-a", "acme/plugins", "1.0.0", "a"),
      "plugin-b": record("plugin-b", "acme/plugins", "2.0.0", "b"),
    }
    const bootstrap = resolvers({ a: "1.0.0", b: "2.0.0" })
    const previousState = await initialState(entries, records, bootstrap)
    const services = resolvers({ a: "1.1.0", b: "2.0.0" })

    const plan = await createScanPlan({
      entries,
      previousState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })

    expect(
      plan.entries
        .filter((planned) => planned.gitTarget)
        .map((planned) => ({
          id: planned.registry.id,
          version: planned.gitTarget?.version,
          commit: planned.gitTarget?.commit,
        }))
    ).toEqual([{ id: "plugin-a", version: "1.1.0", commit: NEW_COMMIT }])
    expect(services.resolveCommit).toHaveBeenCalledTimes(1)
  })

  it("pins a new npm release only after Git has the same version", async () => {
    const pluginEntry = entry("plugin", undefined, "@acme/plugin")
    const active = record("plugin", "acme/plugins", "1.0.0")
    active.package = "@acme/plugin"
    active.npm = {
      package: "@acme/plugin",
      version: "1.0.0",
      integrity: INTEGRITY_1,
      publishedAt: PUBLISHED_AT,
      downloadsLast30Days: 1,
    }
    active.npmSecurity = {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      version: "1.0.0",
      integrity: INTEGRITY_1,
    }
    const bootstrap = resolvers({ ".": "1.0.0" })
    const previousState = await initialState(
      [pluginEntry],
      { plugin: active },
      bootstrap
    )
    const services = resolvers({ ".": "1.1.0" })
    services.resolveNpm = vi.fn(async () => ({
      latest: {
        package: "@acme/plugin",
        version: "1.1.0",
        integrity: INTEGRITY_2,
        resolved: "https://registry.npmjs.org/@acme/plugin/-/plugin-1.1.0.tgz",
        publishedAt: PUBLISHED_AT,
      },
    }))

    const plan = await createScanPlan({
      entries: [pluginEntry],
      previousState,
      mode: "npm",
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })

    expect(plan.entries[0]).toMatchObject({
      observedGit: { commit: NEW_COMMIT, version: "1.1.0" },
      gitTarget: { commit: NEW_COMMIT, version: "1.1.0" },
      npmTargets: [
        {
          channel: "latest",
          release: {
            package: "@acme/plugin",
            version: "1.1.0",
            integrity: INTEGRITY_2,
          },
        },
      ],
    })
  })

  it("remembers a failed candidate and retries an unavailable candidate", async () => {
    const pluginEntry = entry("plugin")
    const active = record("plugin", "acme/plugins", "1.0.0")
    const bootstrap = resolvers({ ".": "1.0.0" })
    const failedState = await initialState(
      [pluginEntry],
      { plugin: active },
      bootstrap
    )
    const changed = resolvers({ ".": "1.1.0" })
    const firstPlan = await createScanPlan({
      entries: [pluginEntry],
      previousState: failedState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: changed,
    })
    const targetKey = firstPlan.entries[0].gitTarget?.targetKey
    expect(targetKey).toBeDefined()

    failedState.entries.plugin.lastAttempt = {
      git: {
        targetKey: targetKey as string,
        result: {
          ...GIT_RESULT,
          status: "failed",
          blockingFindings: 1,
        },
      },
    }
    const terminalPlan = await createScanPlan({
      entries: [pluginEntry],
      previousState: failedState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: changed,
    })
    expect(terminalPlan.entries[0].gitTarget).toBeUndefined()

    failedState.entries.plugin.lastAttempt.git = {
      targetKey: targetKey as string,
      result: {
        ...GIT_RESULT,
        status: "unavailable",
        blockingFindings: 1,
      },
    }
    const retryPlan = await createScanPlan({
      entries: [pluginEntry],
      previousState: failedState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: changed,
    })
    expect(retryPlan.entries[0].gitTarget?.targetKey).toBe(targetKey)

    failedState.entries.plugin.lastAttempt.git = {
      targetKey: targetKey as string,
      result: GIT_RESULT,
    }
    const promotionPlan = await createScanPlan({
      entries: [pluginEntry],
      previousState: failedState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: changed,
    })
    expect(promotionPlan.entries[0].gitTarget).toBeUndefined()
    expect(promotionPlan.needsAssembly).toBe(true)
  })

  it("falls back to commit changes for placeholder versions", async () => {
    const pluginEntry = entry("plugin")
    const active = record("plugin", "acme/plugins", "0.0.0")
    const bootstrap = resolvers({ ".": "0.0.0" })
    const previousState = await initialState(
      [pluginEntry],
      { plugin: active },
      bootstrap
    )
    const services = resolvers({ ".": "0.0.0" })

    const plan = await createScanPlan({
      entries: [pluginEntry],
      previousState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })

    expect(plan.entries[0].gitTarget).toMatchObject({ commit: NEW_COMMIT })
  })

  it("forces assembly when authoritative registry membership shrinks", async () => {
    const entries = [entry("plugin-a", "a"), entry("plugin-b", "b")]
    const services = resolvers({ a: "1.0.0", b: "2.0.0" })
    const previousState = await initialState(
      entries,
      {
        "plugin-a": record("plugin-a", "acme/plugins", "1.0.0", "a"),
        "plugin-b": record("plugin-b", "acme/plugins", "2.0.0", "b"),
      },
      services
    )

    const plan = await createScanPlan({
      entries: [entries[0]],
      previousState,
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })

    expect(plan.needsAssembly).toBe(true)
    expect(plan.entries).toHaveLength(1)
  })

  it("treats an npm dist-tag rollback as a new exact artifact", async () => {
    const pluginEntry = entry("plugin", undefined, "@acme/plugin")
    const active = record("plugin", "acme/plugins", "2.0.0")
    active.package = "@acme/plugin"
    active.npm = {
      package: "@acme/plugin",
      version: "2.0.0",
      integrity: INTEGRITY_2,
      publishedAt: PUBLISHED_AT,
    }
    active.npmSecurity = {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      version: "2.0.0",
      integrity: INTEGRITY_2,
    }
    const bootstrap = resolvers({ ".": "2.0.0" })
    const previousState = await initialState(
      [pluginEntry],
      { plugin: active },
      bootstrap
    )
    const services = resolvers({ ".": "1.5.0" })
    services.resolveNpm = vi.fn(async () => ({
      latest: {
        package: "@acme/plugin",
        version: "1.5.0",
        integrity: INTEGRITY_1,
        resolved: "https://registry.npmjs.org/@acme/plugin/-/plugin-1.5.0.tgz",
        publishedAt: PUBLISHED_AT,
      },
    }))

    const plan = await createScanPlan({
      entries: [pluginEntry],
      previousState,
      mode: "npm",
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })

    expect(plan.entries[0].gitTarget?.version).toBe("1.5.0")
    expect(plan.entries[0].npmTargets[0]?.release.version).toBe("1.5.0")
  })

  it("assembles when a resolved package removes its next tag", async () => {
    const pluginEntry = entry("plugin", undefined, "@acme/plugin")
    const active = record("plugin", "acme/plugins", "1.0.0")
    active.package = "@acme/plugin"
    active.npm = {
      package: "@acme/plugin",
      version: "1.0.0",
      integrity: INTEGRITY_1,
      publishedAt: PUBLISHED_AT,
    }
    active.npmSecurity = {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      version: "1.0.0",
      integrity: INTEGRITY_1,
    }
    active.npmPreview = {
      package: "@acme/plugin",
      version: "1.1.0-next.1",
      integrity: INTEGRITY_2,
      distTag: "next",
      publishedAt: PUBLISHED_AT,
    }
    active.npmPreviewSecurity = {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      version: "1.1.0-next.1",
      integrity: INTEGRITY_2,
    }
    const services = resolvers({ ".": "1.0.0" })
    const previousState = await initialState(
      [pluginEntry],
      { plugin: active },
      services
    )
    services.resolveNpm = vi.fn(async () => ({
      latest: {
        package: "@acme/plugin",
        version: "1.0.0",
        integrity: INTEGRITY_1,
        resolved: "https://registry.npmjs.org/@acme/plugin/-/plugin-1.0.0.tgz",
        publishedAt: PUBLISHED_AT,
      },
    }))

    const plan = await createScanPlan({
      entries: [pluginEntry],
      previousState,
      mode: "npm",
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })

    expect(plan.needsAssembly).toBe(true)
    expect(plan.entries[0].npmTargets).toEqual([])
    expect(plan.entries[0].observedNpmPreview).toBeUndefined()
  })

  it("rejects a candidate when its repository moved after planning", async () => {
    const pluginEntry = entry("plugin")
    const services = resolvers({ ".": "1.0.0" })
    const plan = await createScanPlan({
      entries: [pluginEntry],
      catalogDigest: DIGEST,
      securityDigest: DIGEST,
      resolvers: services,
    })
    vi.mocked(services.resolveCommit).mockResolvedValue("3".repeat(40))

    await expect(verifyScanPlan(plan, services)).rejects.toThrow(
      "repository HEAD changed"
    )
  })
})
