#!/usr/bin/env bun
import { spawnSync } from "node:child_process"

export type SubmissionPullRequest = {
  number: number
  state: "OPEN" | "CLOSED" | "MERGED"
  mergedAt?: string | null
}

export type SubmissionState = {
  branch: string
  mode: "create" | "update" | "closed" | "merged"
  pullRequestNumber?: number
}

export function submissionBranch(issueNumber: number): string {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("ISSUE_NUMBER must be a positive integer")
  }
  return `plugin-submission/issue-${issueNumber}`
}

export function resolveSubmissionState(
  issueNumber: number,
  pullRequests: SubmissionPullRequest[]
): SubmissionState {
  const branch = submissionBranch(issueNumber)
  if (pullRequests.length === 0) return { branch, mode: "create" }
  if (pullRequests.length > 1) {
    throw new Error(`Multiple pull requests already use ${branch}`)
  }

  const pullRequest = pullRequests[0]
  if (!pullRequest || !Number.isSafeInteger(pullRequest.number)) {
    throw new Error("GitHub returned an invalid pull request")
  }
  if (pullRequest.state === "MERGED" || pullRequest.mergedAt) {
    return {
      branch,
      mode: "merged",
      pullRequestNumber: pullRequest.number,
    }
  }
  if (pullRequest.state === "OPEN") {
    return {
      branch,
      mode: "update",
      pullRequestNumber: pullRequest.number,
    }
  }
  return {
    branch,
    mode: "closed",
    pullRequestNumber: pullRequest.number,
  }
}

export function existingRegistryId(changedPaths: string[]): string {
  const registryPaths = changedPaths
    .filter(Boolean)
    .filter((path) => path.startsWith("registry/"))
  if (registryPaths.length !== 1) {
    throw new Error(
      `Expected one generated registry entry, found ${registryPaths.length}`
    )
  }

  const match = /^registry\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/.exec(
    registryPaths[0] ?? ""
  )
  if (!match?.[1]) throw new Error("Generated registry path is invalid")
  return match[1]
}

export function runCaptured(
  command: string[],
  env: NodeJS.ProcessEnv = process.env
): { exitCode: number; output: string } {
  const [program, ...args] = command
  if (!program) throw new Error("A command is required")
  const result = spawnSync(program, args, { env, encoding: "utf8" })
  if (result.error) throw result.error
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout}${result.stderr}`,
  }
}

function requiredPositiveInteger(name: string): number {
  const value = Number(process.env[name])
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return value
}

function printOutput(name: string, value: string | number | undefined): void {
  if (value !== undefined) console.log(`${name}=${value}`)
}

async function main(): Promise<void> {
  const command = process.argv[2]
  if (command === "resolve") {
    const issueNumber = requiredPositiveInteger("ISSUE_NUMBER")
    const pullRequests = JSON.parse(
      process.env.PULL_REQUESTS_JSON ?? "[]"
    ) as SubmissionPullRequest[]
    const state = resolveSubmissionState(issueNumber, pullRequests)
    printOutput("branch", state.branch)
    printOutput("mode", state.mode)
    printOutput("pr_number", state.pullRequestNumber)
    return
  }

  if (command === "existing-id") {
    printOutput(
      "existing_registry_id",
      existingRegistryId((process.env.CHANGED_PATHS ?? "").split("\n"))
    )
    return
  }

  if (command === "generate") {
    const result = runCaptured([
      process.execPath,
      "run",
      "scripts/create-registry-entry-from-issue.ts",
    ])
    process.stdout.write(result.output)
    process.exitCode = result.exitCode
    return
  }

  throw new Error("usage: plugin-submission <resolve|existing-id|generate>")
}

if (import.meta.main) await main()
