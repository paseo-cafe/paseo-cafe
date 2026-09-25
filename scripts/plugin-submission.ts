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
