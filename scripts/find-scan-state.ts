#!/usr/bin/env bun
import { writeFileSync } from "node:fs"
import { z } from "zod"

const SCAN_STATE_ARTIFACT = "registry-scan-state-v1"

const artifactListSchema = z.object({
  artifacts: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      expired: z.boolean(),
      created_at: z.string().nullable(),
      workflow_run: z
        .object({
          id: z.number().int().positive(),
          head_branch: z.string().nullable(),
        })
        .nullable(),
    })
  ),
})

const workflowRunSchema = z.object({
  id: z.number().int().positive(),
  conclusion: z.string().nullable(),
  head_branch: z.string().nullable(),
  path: z.string(),
})

export interface ScanStateArtifact {
  artifactId: number
  runId: number
}

export async function findTrustedScanState(options: {
  repository: string
  defaultBranch: string
  currentRunId?: number
  token: string
  fetcher?: typeof fetch
}): Promise<ScanStateArtifact | undefined> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(options.repository)) {
    throw new Error("GITHUB_REPOSITORY must be owner/repo")
  }
  const fetcher = options.fetcher ?? fetch
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${options.token}`,
    "x-github-api-version": "2026-03-10",
    "user-agent": "paseo-scan-state",
  }
  const artifactsResponse = await fetcher(
    `https://api.github.com/repos/${options.repository}/actions/artifacts?name=${SCAN_STATE_ARTIFACT}&per_page=100`,
    { headers }
  )
  if (!artifactsResponse.ok) {
    throw new Error(`GitHub artifacts API error ${artifactsResponse.status}`)
  }
  const artifacts = artifactListSchema
    .parse(await artifactsResponse.json())
    .artifacts.filter(
      (artifact) =>
        !artifact.expired &&
        artifact.name === SCAN_STATE_ARTIFACT &&
        artifact.workflow_run &&
        artifact.workflow_run.id !== options.currentRunId
    )
    .sort((left, right) =>
      (right.created_at ?? "").localeCompare(left.created_at ?? "")
    )

  for (const artifact of artifacts) {
    const runId = artifact.workflow_run?.id
    if (!runId) continue
    const runResponse = await fetcher(
      `https://api.github.com/repos/${options.repository}/actions/runs/${runId}`,
      { headers }
    )
    if (!runResponse.ok) continue
    const run = workflowRunSchema.parse(await runResponse.json())
    const trustedWorkflow =
      run.path === ".github/workflows/deploy-pages.yml" ||
      run.path.startsWith(".github/workflows/deploy-pages.yml@")
    if (
      run.conclusion === "success" &&
      run.head_branch === options.defaultBranch &&
      trustedWorkflow
    ) {
      return { artifactId: artifact.id, runId }
    }
  }
  return undefined
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH ?? "main"
  if (!repository || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required")
  }
  const currentRunId = process.env.GITHUB_RUN_ID
    ? Number(process.env.GITHUB_RUN_ID)
    : undefined
  let artifact: ScanStateArtifact | undefined
  try {
    artifact = await findTrustedScanState({
      repository,
      defaultBranch,
      currentRunId,
      token,
    })
  } catch (error) {
    console.warn(
      `Prior scan state unavailable; recomputing: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (process.env.GITHUB_OUTPUT) {
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      artifact
        ? `found=true\nrun_id=${artifact.runId}\nartifact_id=${artifact.artifactId}\n`
        : "found=false\nrun_id=\nartifact_id=\n",
      { flag: "a" }
    )
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
