#!/usr/bin/env bun
import { readFile } from "node:fs/promises"
import { setTimeout as sleep } from "node:timers/promises"
import type { Api } from "@octokit/plugin-rest-endpoint-methods"
import { Octokit } from "@octokit/rest"
import type { ApplicationFunction, Context } from "probot"
import { Probot } from "probot"
import {
  type GeneratedRegistryEntry,
  generateRegistryEntryFromIssue,
  isPluginSubmissionIssue,
} from "./create-registry-entry-from-issue.ts"
import {
  existingRegistryId,
  resolveSubmissionState,
  type SubmissionPullRequest,
  submissionBranch,
} from "./plugin-submission.ts"

const REGISTRY_PATH = /^registry\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/
const REQUIRED_CHECKS: Record<string, true> = {
  "All checks passed": true,
  "Registry admission": true,
}
const REQUIRED_GENERATED_SUBMISSION_CHECKS: Record<string, true> = {
  "Registry admission": true,
}
const APPROVABLE_WORKFLOWS: Record<string, string> = {
  CI: ".github/workflows/ci.yml",
  "Registry admission": ".github/workflows/plugin-security.yml",
}

const ACTIONS_APP_SLUG = "github-actions"

/** Identifies PRs created from the deterministic issue-submission workflow. */
export function isActionsSubmissionPullRequest(
  author: string | undefined,
  headRef: string
): boolean {
  return (
    author === "github-actions[bot]" &&
    /^plugin-submission\/issue-[1-9][0-9]*$/.test(headRef)
  )
}

export type PullRequestFile = {
  filename: string
  status: "added" | "modified" | "removed" | "renamed" | string
  previous_filename?: string
}

export type CheckRun = {
  name: string
  status: string
  conclusion: string | null
  app: { slug?: string } | null
}

export type PullRequestReview = {
  state: string
  user: { login: string } | null
}

export type WorkflowRunReference = {
  display_title?: string
  event: string
  name: string | null
  pull_requests: Array<{ number: number } | null>
}

/** Resolves associated PRs, including trusted admission dispatch run titles. */
export function workflowRunPullRequestNumbers(
  workflowRun: WorkflowRunReference
): number[] {
  const pullNumbers = new Set(
    workflowRun.pull_requests.flatMap((pullRequest) =>
      pullRequest ? [pullRequest.number] : []
    )
  )
  if (workflowRun.event === "workflow_dispatch") {
    for (const title of [workflowRun.display_title, workflowRun.name]) {
      const match = /^Registry admission PR #([1-9][0-9]*)$/.exec(title ?? "")
      if (match?.[1]) pullNumbers.add(Number(match[1]))
    }
  }
  return [...pullNumbers]
}

/** Returns whether any reviewer's latest decision still requests changes. */
export function hasActiveChangesRequest(reviews: PullRequestReview[]): boolean {
  const latestReviewByUser = new Map<string, string>()
  for (const review of reviews) {
    if (
      review.user?.login &&
      (review.state === "APPROVED" ||
        review.state === "CHANGES_REQUESTED" ||
        review.state === "DISMISSED")
    ) {
      latestReviewByUser.set(review.user.login, review.state)
    }
  }
  return [...latestReviewByUser.values()].some(
    (state) => state === "CHANGES_REQUESTED"
  )
}

/** Restricts automatic merging to newly added, flat registry JSON entries. */
export function isRegistryOnlyPullRequest(files: PullRequestFile[]): boolean {
  return (
    files.length > 0 &&
    files.length <= 20 &&
    files.every(
      (file) =>
        file.status === "added" &&
        REGISTRY_PATH.test(file.filename) &&
        !file.previous_filename
    )
  )
}

/** Requires every requested trusted GitHub Actions check on the current head. */
export function hasRequiredSuccessfulChecks(
  checks: CheckRun[],
  requiredChecks: Record<string, true> = REQUIRED_CHECKS
): boolean {
  return Object.keys(requiredChecks).every((name) => {
    const check = checks.find(
      (candidate) =>
        candidate.name === name && candidate.app?.slug === ACTIONS_APP_SLUG
    )
    return check?.status === "completed" && check.conclusion === "success"
  })
}

type BaristaContext = Context<"issues" | "pull_request" | "workflow_run">
type RestOctokit = Context["octokit"] & Api
let submissionClient: Octokit | undefined

/** Returns the Actions-token client used only to author submission branches and PRs. */
function submissionOctokit(): Octokit {
  const token = process.env.GITHUB_PR_CREATOR_TOKEN
  if (!token)
    throw new Error("GITHUB_PR_CREATOR_TOKEN is required for submissions")
  submissionClient ??= new Octokit({ auth: token })
  return submissionClient
}

/** Exposes Probot's authenticated REST endpoint methods with their concrete type. */
function octokit(context: Context): RestOctokit {
  return context.octokit as RestOctokit
}

/** Extracts repository coordinates from any Barista event context. */
function repository(context: BaristaContext) {
  const { owner, repo } = context.repo()
  return { owner, repo }
}

/** Lists every changed file in a pull request, following API pagination. */
async function listPullRequestFiles(
  context: BaristaContext,
  pullNumber: number
): Promise<PullRequestFile[]> {
  return octokit(context).paginate(octokit(context).rest.pulls.listFiles, {
    ...repository(context),
    pull_number: pullNumber,
    per_page: 100,
  })
}

/** Lists the latest check runs attached to one exact commit. */
async function listCheckRuns(
  context: BaristaContext,
  ref: string
): Promise<CheckRun[]> {
  return octokit(context).paginate(octokit(context).rest.checks.listForRef, {
    ...repository(context),
    ref,
    per_page: 100,
    filter: "latest",
  })
}
/** Approves only allowlisted action-required runs bound to this PR and head. */
async function approveActionRequiredWorkflowRuns(
  context: BaristaContext,
  pullNumber: number,
  headSha: string,
  waitForRuns = false
): Promise<void> {
  const repo = repository(context)
  const approvedRunIds = new Set<number>()
  const attempts = waitForRuns ? 10 : 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const runs = await octokit(context).paginate(
      octokit(context).rest.actions.listWorkflowRunsForRepo,
      {
        ...repo,
        head_sha: headSha,
        status: "action_required",
        per_page: 100,
      }
    )
    for (const run of runs) {
      if (
        !approvedRunIds.has(run.id) &&
        APPROVABLE_WORKFLOWS[run.name ?? ""] === run.path &&
        run.pull_requests?.some(
          (pullRequest) => pullRequest.number === pullNumber
        )
      ) {
        await octokit(context).rest.actions.approveWorkflowRun({
          ...repo,
          run_id: run.id,
        })
        approvedRunIds.add(run.id)
      }
    }
    if (attempt + 1 < attempts) await sleep(3_000)
  }
}
/** Dispatches trusted registry admission and its head-bound synthetic check. */
export async function dispatchRegistryAdmission(
  context: BaristaContext,
  pullNumber: number
): Promise<void> {
  await octokit(context).rest.actions.createWorkflowDispatch({
    ...repository(context),
    workflow_id: "plugin-security.yml",
    ref: context.payload.repository.default_branch,
    inputs: { pr_number: String(pullNumber) },
  })
}

/** Atomically creates or updates the generated registry entry commit. */
async function upsertSubmissionCommit(
  context: Context<"issues">,
  branch: string,
  previousRegistryId: string | undefined,
  registryId: string,
  content: string,
  issueNumber: number
): Promise<boolean> {
  const repo = repository(context)
  const defaultBranch = context.payload.repository.default_branch
  const existingRef = await submissionOctokit()
    .rest.git.getRef({ ...repo, ref: `heads/${branch}` })
    .catch((error: { status?: number }) => {
      if (error.status === 404) return undefined
      throw error
    })
  const parentSha =
    existingRef?.data.object.sha ??
    (
      await submissionOctokit().rest.git.getRef({
        ...repo,
        ref: `heads/${defaultBranch}`,
      })
    ).data.object.sha
  const parentCommit = await submissionOctokit().rest.git.getCommit({
    ...repo,
    commit_sha: parentSha,
  })
  const blob = await submissionOctokit().rest.git.createBlob({
    ...repo,
    content,
    encoding: "utf-8",
  })
  if (existingRef && previousRegistryId === registryId) {
    const existingTree = await submissionOctokit().rest.git.getTree({
      ...repo,
      tree_sha: parentCommit.data.tree.sha,
      recursive: "1",
    })
    if (
      existingTree.data.tree.some(
        (entry) =>
          entry.path === `registry/${registryId}.json` &&
          entry.sha === blob.data.sha
      )
    ) {
      return false
    }
  }
  const tree = await submissionOctokit().rest.git.createTree({
    ...repo,
    base_tree: parentCommit.data.tree.sha,
    tree: [
      ...(previousRegistryId && previousRegistryId !== registryId
        ? [
            {
              path: `registry/${previousRegistryId}.json`,
              mode: "100644" as const,
              type: "blob" as const,
              sha: null,
            },
          ]
        : []),
      {
        path: `registry/${registryId}.json`,
        mode: "100644",
        type: "blob",
        sha: blob.data.sha,
      },
    ],
  })
  const commit = await submissionOctokit().rest.git.createCommit({
    ...repo,
    message: `Add ${registryId} plugin submission\n\nCloses #${issueNumber}`,
    tree: tree.data.sha,
    parents: [parentSha],
  })
  if (existingRef) {
    await submissionOctokit().rest.git.updateRef({
      ...repo,
      ref: `heads/${branch}`,
      sha: commit.data.sha,
      force: false,
    })
  } else {
    await submissionOctokit().rest.git.createRef({
      ...repo,
      ref: `refs/heads/${branch}`,
      sha: commit.data.sha,
    })
  }
  return true
}

/** Validates a submission issue and creates or updates its deterministic PR. */
export async function handleSubmissionIssue(
  context: Context<"issues">
): Promise<void> {
  const issue = context.payload.issue
  if (
    issue.state !== "open" ||
    !isPluginSubmissionIssue(issue.title, issue.body ?? "")
  ) {
    return
  }

  const repo = repository(context)
  const author = issue.user?.login
  if (!author) return
  const issueNumber = issue.number
  const branch = submissionBranch(issueNumber)
  await octokit(context).rest.issues.addLabels({
    ...repo,
    issue_number: issueNumber,
    labels: ["plugin-submission"],
  })

  const pullRequests = (
    await octokit(context).paginate(octokit(context).rest.pulls.list, {
      ...repo,
      state: "all",
      head: `${repo.owner}:${branch}`,
      per_page: 100,
    })
  ).map(
    (pullRequest): SubmissionPullRequest => ({
      number: pullRequest.number,
      state: pullRequest.merged_at
        ? "MERGED"
        : pullRequest.state === "open"
          ? "OPEN"
          : "CLOSED",
      mergedAt: pullRequest.merged_at,
    })
  )
  const state = resolveSubmissionState(issueNumber, pullRequests)
  if (state.mode === "merged") return
  if (state.mode === "closed") {
    await octokit(context).rest.issues.createComment({
      ...repo,
      issue_number: issueNumber,
      body: `PR #${state.pullRequestNumber} was closed without merging. Reopen that PR before editing this submission again.`,
    })
    return
  }

  let generated: GeneratedRegistryEntry
  try {
    generated = generateRegistryEntryFromIssue(issue.body ?? "", author)
  } catch (error) {
    await octokit(context).rest.issues.createComment({
      ...repo,
      issue_number: issueNumber,
      body: `Could not generate a registry entry from this issue:\n\n\`\`\`\n${error instanceof Error ? error.message : String(error)}\n\`\`\`\n\nEdit the issue fields above and I'll retry automatically, or open a PR by hand against \`registry/*.json\`.`,
    })
    return
  }
  let previousRegistryId: string | undefined
  if (state.mode === "update") {
    const files = await listPullRequestFiles(
      context,
      state.pullRequestNumber ?? 0
    )
    previousRegistryId = existingRegistryId(files.map((file) => file.filename))
  }
  if (generated.id !== previousRegistryId) {
    const registryEntryExists = await octokit(context)
      .rest.repos.getContent({
        ...repo,
        path: `registry/${generated.id}.json`,
        ref: context.payload.repository.default_branch,
      })
      .then(() => true)
      .catch((error: { status?: number }) => {
        if (error.status === 404) return false
        throw error
      })
    if (registryEntryExists) {
      await octokit(context).rest.issues.createComment({
        ...repo,
        issue_number: issueNumber,
        body: `registry/${generated.id}.json already exists. Pick a different id or edit it in a PR instead.`,
      })
      return
    }
  }
  const changed = await upsertSubmissionCommit(
    context,
    branch,
    previousRegistryId,
    generated.id,
    generated.content,
    issueNumber
  )
  if (!changed) return

  const body = `Closes #${issueNumber}\n\nAutomated from #${issueNumber} by @${author}. Registry admission runs after every update.`
  const pullRequest =
    state.mode === "create"
      ? await submissionOctokit().rest.pulls.create({
          ...repo,
          title: `Add ${generated.id} plugin`,
          body,
          head: branch,
          base: context.payload.repository.default_branch,
        })
      : await submissionOctokit().rest.pulls.update({
          ...repo,
          pull_number: state.pullRequestNumber ?? 0,
          title: `Add ${generated.id} plugin`,
          body,
        })
  await dispatchRegistryAdmission(context, pullRequest.data.number)
  await approveActionRequiredWorkflowRuns(
    context,
    pullRequest.data.number,
    pullRequest.data.head.sha,
    true
  )
}

/** Approves and merges an eligible registry PR after revalidating mutable state. */
export async function reconcilePullRequest(
  context: Context<"pull_request" | "workflow_run">,
  pullNumber: number
): Promise<void> {
  const repo = repository(context)
  const pullRequest = await octokit(context).rest.pulls.get({
    ...repo,
    pull_number: pullNumber,
  })
  if (
    pullRequest.data.state !== "open" ||
    pullRequest.data.draft ||
    pullRequest.data.base.ref !== context.payload.repository.default_branch
  ) {
    return
  }
  const headSha = pullRequest.data.head.sha
  const files = await listPullRequestFiles(context, pullNumber)
  if (!isRegistryOnlyPullRequest(files)) return
  const generatedSubmission = isActionsSubmissionPullRequest(
    pullRequest.data.user?.login,
    pullRequest.data.head.ref
  )
  const requiredChecks = generatedSubmission
    ? REQUIRED_GENERATED_SUBMISSION_CHECKS
    : REQUIRED_CHECKS
  if (generatedSubmission) {
    await approveActionRequiredWorkflowRuns(context, pullNumber, headSha)
  }
  if (
    !hasRequiredSuccessfulChecks(
      await listCheckRuns(context, headSha),
      requiredChecks
    )
  ) {
    return
  }

  const current = await octokit(context).rest.pulls.get({
    ...repo,
    pull_number: pullNumber,
  })
  if (current.data.head.sha !== headSha || current.data.state !== "open") return
  const reviews = await octokit(context).paginate(
    octokit(context).rest.pulls.listReviews,
    {
      ...repo,
      pull_number: pullNumber,
      per_page: 100,
    }
  )
  if (hasActiveChangesRequest(reviews)) return

  const appSlug = process.env.BARISTA_APP_SLUG
  if (!appSlug) throw new Error("BARISTA_APP_SLUG is required")
  const appLogin = `${appSlug}[bot]`
  const alreadyApproved = reviews.some(
    (review) =>
      review.user?.login === appLogin &&
      review.state === "APPROVED" &&
      review.commit_id === headSha
  )
  const appAuthoredPullRequest = pullRequest.data.user?.login === appLogin
  const alreadyCommented = reviews.some(
    (review) =>
      review.user?.login === appLogin &&
      review.state === "COMMENTED" &&
      review.commit_id === headSha
  )
  if (!alreadyApproved && !appAuthoredPullRequest) {
    await octokit(context).rest.pulls.createReview({
      ...repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: "APPROVE",
      body: "Registry-only change passed CI and Registry admission.",
    })
  } else if (appAuthoredPullRequest && !alreadyCommented) {
    await octokit(context).rest.pulls.createReview({
      ...repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: "COMMENT",
      body: "Registry-only change passed CI and Registry admission. GitHub does not allow an app to approve its own pull request.",
    })
  }

  const finalPullRequest = await octokit(context).rest.pulls.get({
    ...repo,
    pull_number: pullNumber,
  })
  if (
    finalPullRequest.data.head.sha !== headSha ||
    finalPullRequest.data.state !== "open"
  ) {
    return
  }
  const finalFiles = await listPullRequestFiles(context, pullNumber)
  if (!isRegistryOnlyPullRequest(finalFiles)) return
  if (
    !hasRequiredSuccessfulChecks(
      await listCheckRuns(context, headSha),
      requiredChecks
    )
  ) {
    return
  }
  await octokit(context).rest.pulls.merge({
    ...repo,
    pull_number: pullNumber,
    sha: headSha,
    merge_method: "squash",
  })
}

/** Registers Barista's issue, pull-request, and workflow-run handlers. */
export const barista: ApplicationFunction = (app) => {
  app.on(["issues.opened", "issues.edited"], handleSubmissionIssue)
  app.on(
    [
      "pull_request.opened",
      "pull_request.reopened",
      "pull_request.synchronize",
      "pull_request.ready_for_review",
    ],
    async (context) =>
      reconcilePullRequest(context, context.payload.pull_request.number)
  )
  app.on(
    ["workflow_run.requested", "workflow_run.completed"],
    async (context) => {
      const workflowRun = context.payload.workflow_run
      const pullNumbers = workflowRunPullRequestNumbers(workflowRun)
      if (workflowRun.name !== "CI" && pullNumbers.length === 0) return
      for (const pullNumber of pullNumbers) {
        await reconcilePullRequest(context, pullNumber)
      }
    }
  )
}

/** Replays the current Actions event through the one-shot Probot application. */
async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN
  const eventPath = process.env.GITHUB_EVENT_PATH
  const eventName = process.env.GITHUB_EVENT_NAME
  if (!token || !eventPath || !eventName) {
    throw new Error(
      "GITHUB_TOKEN, GITHUB_EVENT_PATH, and GITHUB_EVENT_NAME are required"
    )
  }
  const name = eventName === "pull_request_target" ? "pull_request" : eventName
  const payload = JSON.parse(await readFile(eventPath, "utf8")) as Record<
    string,
    unknown
  >
  const probot = new Probot({ githubToken: token })
  await probot.load(barista)
  await probot.receive({
    id: process.env.GITHUB_RUN_ID ?? crypto.randomUUID(),
    name,
    payload,
  } as never)
}

if (import.meta.main) await main()
