#!/usr/bin/env bun
import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import * as semver from "semver"
import { z } from "zod"
import {
  normalizePluginVersion,
  pluginRecordSchema,
} from "../src/lib/plugin-schema.ts"
import {
  registryEntrySchema,
  registryIdSchema,
} from "../src/lib/registry-schema.ts"
import {
  type NpmPackageRelease,
  resolveNpmPackageReleases,
} from "./npm-registry.ts"
import {
  securityNpmResultSchema,
  securityPluginResultSchema,
} from "./plugin-security/shared.ts"

export const SCAN_PLAN_VERSION = 1 as const
export const SCAN_STATE_VERSION = 1 as const
export const SECURITY_POLICY_VERSION = 1 as const

const npmReleaseSchema = z
  .object({
    package: z.string(),
    version: z.string(),
    integrity: z.string().startsWith("sha512-"),
    resolved: z.string().url(),
    publishedAt: z.string().datetime().optional(),
    description: z.string().optional(),
    license: z.string().optional(),
    repository: z
      .object({
        type: z.string().optional(),
        url: z.string().optional(),
        directory: z.string().optional(),
      })
      .optional(),
  })
  .strict()

const registryEntryWithIdSchema = registryEntrySchema.extend({
  id: registryIdSchema,
})

const gitAttemptSchema = z
  .object({
    targetKey: z.string().regex(/^[0-9a-f]{64}$/),
    result: securityPluginResultSchema,
  })
  .strict()

const npmAttemptSchema = z
  .object({
    targetKey: z.string().regex(/^[0-9a-f]{64}$/),
    result: securityNpmResultSchema,
  })
  .strict()

const scanStateEntrySchema = z
  .object({
    sourceKey: z.string().regex(/^[0-9a-f]{64}$/),
    registryKey: z.string().regex(/^[0-9a-f]{64}$/),
    active: pluginRecordSchema.optional(),
    lastAttempt: z
      .object({
        git: gitAttemptSchema.optional(),
        npmLatest: npmAttemptSchema.optional(),
        npmPreview: npmAttemptSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export const registryScanStateSchema = z
  .object({
    version: z.literal(SCAN_STATE_VERSION),
    generatedAt: z.string().datetime(),
    registryDigest: z.string().regex(/^[0-9a-f]{64}$/),
    catalogDigest: z.string().regex(/^[0-9a-f]{64}$/),
    securityDigest: z.string().regex(/^[0-9a-f]{64}$/),
    securityPolicyVersion: z.literal(SECURITY_POLICY_VERSION),
    entries: z.record(registryIdSchema, scanStateEntrySchema),
  })
  .strict()

const gitTargetSchema = z
  .object({
    targetKey: z.string().regex(/^[0-9a-f]{64}$/),
    repo: z.string(),
    path: z.string().optional(),
    commit: z.string().regex(/^[0-9a-f]{40}$/i),
    version: z.string().optional(),
  })
  .strict()

const npmTargetSchema = z
  .object({
    targetKey: z.string().regex(/^[0-9a-f]{64}$/),
    channel: z.enum(["latest", "next"]),
    release: npmReleaseSchema,
  })
  .strict()

export const scanPlanEntrySchema = z
  .object({
    registry: registryEntryWithIdSchema,
    sourceKey: z.string().regex(/^[0-9a-f]{64}$/),
    registryKey: z.string().regex(/^[0-9a-f]{64}$/),
    observedGit: z
      .object({
        targetKey: z.string().regex(/^[0-9a-f]{64}$/),
        commit: z.string().regex(/^[0-9a-f]{40}$/i),
        version: z.string().optional(),
      })
      .strict()
      .optional(),
    npmResolved: z.boolean(),
    observedNpmLatestKey: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    observedNpmLatest: npmReleaseSchema.optional(),
    observedNpmPreviewKey: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    observedNpmPreview: npmReleaseSchema.optional(),
    gitTarget: gitTargetSchema.optional(),
    npmTargets: z.array(npmTargetSchema).max(2),
    needsAssembly: z.boolean(),
  })
  .strict()

export const scanPlanSchema = z
  .object({
    version: z.literal(SCAN_PLAN_VERSION),
    needsAssembly: z.boolean(),
    planId: z.string().regex(/^[0-9a-f]{64}$/),
    mode: z.enum(["full", "npm"]),
    generatedAt: z.string().datetime(),
    registryDigest: z.string().regex(/^[0-9a-f]{64}$/),
    catalogDigest: z.string().regex(/^[0-9a-f]{64}$/),
    securityDigest: z.string().regex(/^[0-9a-f]{64}$/),
    securityPolicyVersion: z.literal(SECURITY_POLICY_VERSION),
    reusedState: z.boolean(),
    entries: z.array(scanPlanEntrySchema),
  })
  .strict()

const candidateEntrySchema = z
  .object({
    git: z
      .object({
        targetKey: z.string().regex(/^[0-9a-f]{64}$/),
        result: securityPluginResultSchema,
      })
      .strict()
      .optional(),
    npmLatest: z
      .object({
        targetKey: z.string().regex(/^[0-9a-f]{64}$/),
        result: securityNpmResultSchema,
      })
      .strict()
      .optional(),
    npmPreview: z
      .object({
        targetKey: z.string().regex(/^[0-9a-f]{64}$/),
        result: securityNpmResultSchema,
      })
      .strict()
      .optional(),
  })
  .strict()

export const candidateScanResultsSchema = z
  .object({
    version: z.literal(1),
    planId: z.string().regex(/^[0-9a-f]{64}$/),
    generatedAt: z.string().datetime(),
    plugins: z.record(registryIdSchema, candidateEntrySchema),
  })
  .strict()

export type RegistryScanState = z.infer<typeof registryScanStateSchema>
export type ScanPlan = z.infer<typeof scanPlanSchema>
export type ScanPlanEntry = z.infer<typeof scanPlanEntrySchema>
export type CandidateScanResults = z.infer<typeof candidateScanResultsSchema>
export type RegistryEntryWithId = z.infer<typeof registryEntryWithIdSchema>
export type ScanPlanBody = Omit<ScanPlan, "planId">

export function sealScanPlan(body: ScanPlanBody): ScanPlan {
  const normalized = scanPlanSchema.omit({ planId: true }).parse(body)
  return scanPlanSchema.parse({ ...normalized, planId: digest(normalized) })
}

export type ScanPlanResolvers = {
  resolveCommit(repo: string): Promise<string>
  resolveGitVersion(
    entry: Pick<RegistryEntryWithId, "repo" | "path">,
    commit: string
  ): Promise<string | undefined>
  resolveNpm(
    packageName: string
  ): Promise<{ latest?: NpmPackageRelease; next?: NpmPackageRelease }>
}

type CreateScanPlanOptions = {
  entries: RegistryEntryWithId[]
  previousState?: RegistryScanState
  mode?: "full" | "npm"
  catalogDigest: string
  securityDigest: string
  resolvers: ScanPlanResolvers
  now?: string
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

export function sourceKey(entry: RegistryEntryWithId): string {
  return digest([
    "source-v1",
    entry.id,
    entry.repo.toLowerCase(),
    entry.path ?? ".",
    entry.package ?? null,
  ])
}

export function registryKey(entry: RegistryEntryWithId): string {
  return digest([
    "registry-v1",
    entry.id,
    entry.repo,
    entry.path ?? null,
    entry.package ?? null,
    entry.categories,
    entry.platforms,
    entry.caveats,
    entry.submittedBy ?? null,
  ])
}

export function registryDigestForEntries(
  entries: readonly RegistryEntryWithId[]
): string {
  return digest(
    entries
      .map((entry) => [entry.id, registryKey(entry)])
      .sort(([left], [right]) => left.localeCompare(right))
  )
}

function releaseChanged(
  current: NpmPackageRelease | undefined,
  published: { package: string; version: string; integrity: string } | undefined
): boolean {
  if (!current) return false
  return (
    !published ||
    current.package !== published.package ||
    current.version !== published.version ||
    current.integrity !== published.integrity
  )
}

function shouldAttempt(
  previous:
    | z.infer<typeof gitAttemptSchema>
    | z.infer<typeof npmAttemptSchema>
    | undefined,
  targetKey: string
): boolean {
  return (
    previous?.targetKey !== targetKey ||
    previous.result.status === "unavailable"
  )
}

export function gitTargetKey(
  entry: RegistryEntryWithId,
  commit: string,
  securityDigest: string
): string {
  return digest([
    "git-attestation-v1",
    entry.id,
    entry.repo.toLowerCase(),
    entry.path ?? ".",
    commit,
    securityDigest,
    SECURITY_POLICY_VERSION,
  ])
}

function npmTargetKey(
  entry: RegistryEntryWithId,
  channel: "latest" | "next",
  release: NpmPackageRelease,
  securityDigest: string
): string {
  return digest([
    "npm-attestation-v1",
    entry.id,
    release.package,
    channel,
    release.version,
    release.integrity,
    securityDigest,
    SECURITY_POLICY_VERSION,
  ])
}

function validReleaseVersion(version: string | undefined): version is string {
  return version !== undefined && version !== "0.0.0"
}

async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  limit: number,
  mapper: (value: Input) => Promise<Output>
): Promise<Output[]> {
  const output = new Array<Output>(values.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      output[index] = await mapper(values[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker())
  )
  return output
}

export async function createScanPlan({
  entries,
  previousState,
  mode = "full",
  catalogDigest,
  securityDigest,
  resolvers,
  now = new Date().toISOString(),
}: CreateScanPlanOptions): Promise<ScanPlan> {
  const usableState =
    previousState?.catalogDigest === catalogDigest &&
    previousState.securityDigest === securityDigest &&
    previousState.securityPolicyVersion === SECURITY_POLICY_VERSION
      ? previousState
      : undefined
  const commitPromises = new Map<string, Promise<string>>()
  const commitFor = (repo: string) => {
    let pending = commitPromises.get(repo)
    if (!pending) {
      pending = resolvers.resolveCommit(repo)
      commitPromises.set(repo, pending)
    }
    return pending
  }
  const npmPromises = new Map<
    string,
    Promise<{ latest?: NpmPackageRelease; next?: NpmPackageRelease }>
  >()
  const npmFor = (packageName: string) => {
    let pending = npmPromises.get(packageName)
    if (!pending) {
      pending = resolvers.resolveNpm(packageName)
      npmPromises.set(packageName, pending)
    }
    return pending
  }

  const plannedEntries = await mapWithConcurrency(
    entries,
    8,
    async (entry): Promise<ScanPlanEntry> => {
      const currentSourceKey = sourceKey(entry)
      const currentRegistryKey = registryKey(entry)
      const previous = usableState?.entries[entry.id]
      const sourceChanged = previous?.sourceKey !== currentSourceKey
      const active =
        !sourceChanged && previous?.active?.id === entry.id
          ? previous.active
          : undefined

      let observedNpmLatest: NpmPackageRelease | undefined
      let observedNpmPreview: NpmPackageRelease | undefined
      let npmResolved = false
      if (entry.package) {
        try {
          const releases = await npmFor(entry.package)
          npmResolved = true
          observedNpmLatest = releases.latest
          observedNpmPreview =
            releases.latest &&
            releases.next &&
            releases.next.version !== releases.latest.version
              ? releases.next
              : undefined
        } catch (error) {
          console.warn(
            `  ! npm release resolution failed for ${entry.package}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      const latestChanged = releaseChanged(observedNpmLatest, active?.npm)
      const previewChanged = Boolean(
        npmResolved &&
          ((observedNpmPreview &&
            releaseChanged(observedNpmPreview, active?.npmPreview)) ||
            (!observedNpmPreview && active?.npmPreview))
      )
      const latestKey = observedNpmLatest
        ? npmTargetKey(entry, "latest", observedNpmLatest, securityDigest)
        : undefined
      const previewKey = observedNpmPreview
        ? npmTargetKey(entry, "next", observedNpmPreview, securityDigest)
        : undefined
      const storedLatestAttempt = previous?.lastAttempt?.npmLatest
      const latestAttempt =
        storedLatestAttempt &&
        storedLatestAttempt.targetKey === latestKey &&
        observedNpmLatest &&
        storedLatestAttempt.result.package === observedNpmLatest.package &&
        storedLatestAttempt.result.version === observedNpmLatest.version &&
        storedLatestAttempt.result.integrity === observedNpmLatest.integrity
          ? storedLatestAttempt
          : undefined
      const storedPreviewAttempt = previous?.lastAttempt?.npmPreview
      const previewAttempt =
        storedPreviewAttempt &&
        storedPreviewAttempt.targetKey === previewKey &&
        observedNpmPreview &&
        storedPreviewAttempt.result.package === observedNpmPreview.package &&
        storedPreviewAttempt.result.version === observedNpmPreview.version &&
        storedPreviewAttempt.result.integrity === observedNpmPreview.integrity
          ? storedPreviewAttempt
          : undefined
      const latestNeedsAttempt = Boolean(
        latestChanged && latestKey && shouldAttempt(latestAttempt, latestKey)
      )
      const previewNeedsAttempt = Boolean(
        observedNpmPreview &&
          previewChanged &&
          previewKey &&
          shouldAttempt(previewAttempt, previewKey)
      )
      const latestPassedButInactive = Boolean(
        latestChanged && latestAttempt?.result.status === "passed"
      )
      const previewPassedButInactive = Boolean(
        observedNpmPreview &&
          previewChanged &&
          previewAttempt?.result.status === "passed"
      )

      const needsGitProbe =
        mode === "full" ||
        sourceChanged ||
        latestNeedsAttempt ||
        previewNeedsAttempt ||
        latestPassedButInactive ||
        previewPassedButInactive
      let observedGit: ScanPlanEntry["observedGit"]
      if (needsGitProbe) {
        try {
          const commit = await commitFor(entry.repo)
          observedGit = {
            targetKey: gitTargetKey(entry, commit, securityDigest),
            commit,
            version: await resolvers.resolveGitVersion(entry, commit),
          }
        } catch (error) {
          console.warn(
            `  ! Git release resolution failed for ${entry.repo}${entry.path ? `/${entry.path}` : ""}: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      let gitTarget: ScanPlanEntry["gitTarget"]
      let gitPassedButInactive = false
      if (observedGit) {
        const activeVersion = normalizePluginVersion(active?.version)
        const currentVersion = observedGit.version
        const activeCommit = active?.security?.commit
        const legacyFallback =
          !validReleaseVersion(currentVersion) ||
          !validReleaseVersion(activeVersion)
        const versionAdvanced = Boolean(
          validReleaseVersion(currentVersion) &&
            (!validReleaseVersion(activeVersion) ||
              semver.gt(currentVersion, activeVersion))
        )
        const npmBackedGitTransition = Boolean(
          entry.package &&
            observedNpmLatest &&
            currentVersion === observedNpmLatest.version &&
            currentVersion !== activeVersion
        )
        if (
          !entry.package &&
          validReleaseVersion(currentVersion) &&
          validReleaseVersion(activeVersion) &&
          currentVersion !== activeVersion &&
          !versionAdvanced
        ) {
          console.warn(
            `  ! ${entry.id} Git version ${currentVersion} does not advance published ${activeVersion}; retaining the published commit`
          )
        }
        const observedTargetKey = observedGit.targetKey
        const storedGitAttempt = previous?.lastAttempt?.git
        const priorGitAttempt =
          storedGitAttempt?.targetKey === observedTargetKey &&
          storedGitAttempt.result.commit === observedGit.commit
            ? storedGitAttempt
            : undefined
        const unavailableAttempt =
          priorGitAttempt?.result.status === "unavailable"
        const needsGitCandidate = Boolean(
          !active ||
            sourceChanged ||
            versionAdvanced ||
            npmBackedGitTransition ||
            unavailableAttempt ||
            (legacyFallback && observedGit.commit !== activeCommit)
        )
        gitPassedButInactive = Boolean(
          !entry.package &&
            needsGitCandidate &&
            priorGitAttempt?.result.status === "passed"
        )
        if (
          needsGitCandidate &&
          shouldAttempt(priorGitAttempt, observedTargetKey)
        ) {
          gitTarget = {
            targetKey: observedTargetKey,
            repo: entry.repo,
            path: entry.path,
            commit: observedGit.commit,
            version: currentVersion,
          }
        }
      }

      const gitVersionMatchesLatest = Boolean(
        observedGit?.version &&
          observedNpmLatest &&
          observedGit.version === observedNpmLatest.version
      )
      const npmTargets: ScanPlanEntry["npmTargets"] = []
      if (
        observedNpmLatest &&
        latestKey &&
        latestNeedsAttempt &&
        gitVersionMatchesLatest
      ) {
        npmTargets.push({
          targetKey: latestKey,
          channel: "latest",
          release: observedNpmLatest,
        })
      }
      if (
        observedNpmPreview &&
        previewKey &&
        previewNeedsAttempt &&
        gitVersionMatchesLatest
      ) {
        npmTargets.push({
          targetKey: previewKey,
          channel: "next",
          release: observedNpmPreview,
        })
      }
      const needsAssembly = Boolean(
        !active ||
          previous?.registryKey !== currentRegistryKey ||
          gitTarget ||
          npmTargets.length > 0 ||
          gitPassedButInactive ||
          latestPassedButInactive ||
          previewPassedButInactive ||
          (npmResolved && !observedNpmPreview && active?.npmPreview)
      )

      return scanPlanEntrySchema.parse({
        registry: entry,
        sourceKey: currentSourceKey,
        registryKey: currentRegistryKey,
        observedGit,
        npmResolved,
        observedNpmLatest,
        observedNpmLatestKey: latestKey,
        observedNpmPreviewKey: previewKey,
        observedNpmPreview,
        gitTarget,
        npmTargets,
        needsAssembly,
      })
    }
  )

  const registryDigest = registryDigestForEntries(entries)
  const needsAssembly = Boolean(
    usableState?.registryDigest !== registryDigest ||
      plannedEntries.some((entry) => entry.needsAssembly)
  )
  const planBody = {
    version: SCAN_PLAN_VERSION,
    needsAssembly,
    mode,
    generatedAt: now,
    registryDigest,
    catalogDigest,
    securityDigest,
    securityPolicyVersion: SECURITY_POLICY_VERSION,
    reusedState: usableState !== undefined,
    entries: plannedEntries,
  }
  return sealScanPlan(planBody)
}

export function assertScanPlanIntegrity(plan: ScanPlan): void {
  const { planId, ...body } = plan
  if (digest(body) !== planId) throw new Error("scan plan ID is invalid")
  const expectedRegistryDigest = digest(
    plan.entries
      .map((entry) => [entry.registry.id, registryKey(entry.registry)])
      .sort(([left], [right]) => left.localeCompare(right))
  )
  if (expectedRegistryDigest !== plan.registryDigest) {
    throw new Error("scan plan registry digest is invalid")
  }
  for (const entry of plan.entries) {
    if (entry.sourceKey !== sourceKey(entry.registry)) {
      throw new Error(
        `scan plan source key is invalid for ${entry.registry.id}`
      )
    }
    if (entry.registryKey !== registryKey(entry.registry)) {
      throw new Error(
        `scan plan registry key is invalid for ${entry.registry.id}`
      )
    }
    if (
      entry.observedGit &&
      entry.observedGit.targetKey !==
        gitTargetKey(
          entry.registry,
          entry.observedGit.commit,
          plan.securityDigest
        )
    ) {
      throw new Error(
        `scan plan Git identity is invalid for ${entry.registry.id}`
      )
    }
    const expectedLatestKey = entry.observedNpmLatest
      ? npmTargetKey(
          entry.registry,
          "latest",
          entry.observedNpmLatest,
          plan.securityDigest
        )
      : undefined
    const expectedPreviewKey = entry.observedNpmPreview
      ? npmTargetKey(
          entry.registry,
          "next",
          entry.observedNpmPreview,
          plan.securityDigest
        )
      : undefined
    if (
      entry.observedNpmLatestKey !== expectedLatestKey ||
      entry.observedNpmPreviewKey !== expectedPreviewKey
    ) {
      throw new Error(
        `scan plan npm identity is invalid for ${entry.registry.id}`
      )
    }
    if (
      entry.gitTarget &&
      (entry.gitTarget.targetKey !== entry.observedGit?.targetKey ||
        entry.gitTarget.commit !== entry.observedGit.commit ||
        entry.gitTarget.repo !== entry.registry.repo ||
        entry.gitTarget.path !== entry.registry.path)
    ) {
      throw new Error(
        `scan plan Git target is invalid for ${entry.registry.id}`
      )
    }
    for (const target of entry.npmTargets) {
      if (
        target.targetKey !==
        npmTargetKey(
          entry.registry,
          target.channel,
          target.release,
          plan.securityDigest
        )
      ) {
        throw new Error(
          `scan plan npm target is invalid for ${entry.registry.id}`
        )
      }
    }
  }
}

const MAX_PACKAGE_JSON_BYTES = 1 * 1_024 * 1_024

async function readBoundedJson(response: Response, label: string) {
  const contentLength = response.headers.get("content-length")
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_PACKAGE_JSON_BYTES
  ) {
    await response.body?.cancel().catch(() => {})
    throw new Error(`${label} exceeds ${MAX_PACKAGE_JSON_BYTES} bytes`)
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > MAX_PACKAGE_JSON_BYTES) {
    throw new Error(`${label} exceeds ${MAX_PACKAGE_JSON_BYTES} bytes`)
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown
}
export function readRegistryEntries(
  registryRoot: string
): RegistryEntryWithId[] {
  return readdirSync(registryRoot)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const id = registryIdSchema.parse(basename(file, ".json"))
      const entry = registryEntrySchema.parse(
        JSON.parse(readFileSync(join(registryRoot, file), "utf8"))
      )
      return registryEntryWithIdSchema.parse({ id, ...entry })
    })
}

export function readScanState(path: string): RegistryScanState | undefined {
  if (!existsSync(path)) return undefined
  try {
    return registryScanStateSchema.parse(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return undefined
  }
}

function githubHeaders(token?: string) {
  return {
    accept: "application/vnd.github+json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "x-github-api-version": "2022-11-28",
    "user-agent": "paseo-scan-planner",
  }
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}

export function defaultResolvers(token?: string): ScanPlanResolvers {
  return {
    async resolveCommit(repo) {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/commits/HEAD`,
        { headers: githubHeaders(token) }
      )
      if (!response.ok) throw new Error(`GitHub API error ${response.status}`)
      return z
        .object({ sha: z.string().regex(/^[0-9a-f]{40}$/i) })
        .parse(await response.json())
        .sha.toLowerCase()
    },
    async resolveGitVersion(entry, commit) {
      const prefix = entry.path ? `${encodePath(entry.path)}/` : ""
      const response = await fetch(
        `https://raw.githubusercontent.com/${entry.repo}/${commit}/${prefix}package.json`
      )
      if (response.status === 404) return undefined
      if (!response.ok) throw new Error(`GitHub raw error ${response.status}`)
      const body = z
        .object({ version: z.unknown().optional() })
        .passthrough()
        .parse(await readBoundedJson(response, "package.json"))
      return normalizePluginVersion(body.version)
    },
    resolveNpm: resolveNpmPackageReleases,
  }
}

export function writePlanOutputs(plan: ScanPlan): void {
  if (!process.env.GITHUB_OUTPUT) return
  const scanCount = plan.entries.reduce(
    (count, entry) =>
      count + Number(entry.gitTarget !== undefined) + entry.npmTargets.length,
    0
  )
  const targetCount = plan.entries.filter(
    (entry) => entry.gitTarget || entry.npmTargets.length > 0
  ).length
  const needsAssembly = plan.needsAssembly
  writeFileSync(
    process.env.GITHUB_OUTPUT,
    `target_count=${targetCount}\nscan_count=${scanCount}\nassemble=${needsAssembly}\n`,
    { flag: "a" }
  )
}

function valueFor(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

async function main() {
  const args = process.argv.slice(2)

  const output = valueFor(args, "--output")
  if (!output) throw new Error("missing --output")
  const root = process.cwd()
  const registryRoot = resolve(root, valueFor(args, "--registry") ?? "registry")
  const statePath = resolve(
    root,
    valueFor(args, "--state") ?? "data/registry-scan-state.json"
  )
  const mode = valueFor(args, "--mode") ?? "full"
  if (mode !== "full" && mode !== "npm") {
    throw new Error('--mode must be "full" or "npm"')
  }
  const catalogDigest = process.env.CATALOG_IMPLEMENTATION_DIGEST
  const securityDigest = process.env.SECURITY_IMPLEMENTATION_DIGEST
  if (!catalogDigest || !/^[0-9a-f]{64}$/.test(catalogDigest)) {
    throw new Error("CATALOG_IMPLEMENTATION_DIGEST must be a SHA-256 digest")
  }
  if (!securityDigest || !/^[0-9a-f]{64}$/.test(securityDigest)) {
    throw new Error("SECURITY_IMPLEMENTATION_DIGEST must be a SHA-256 digest")
  }
  const plan = await createScanPlan({
    entries: readRegistryEntries(registryRoot),
    previousState: readScanState(statePath),
    mode,
    catalogDigest,
    securityDigest,
    resolvers: defaultResolvers(process.env.GITHUB_TOKEN),
  })
  writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`)
  writePlanOutputs(plan)
}
if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
