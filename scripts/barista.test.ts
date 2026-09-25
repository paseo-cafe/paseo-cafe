import { describe, expect, it, vi } from "vitest"
import {
  type CheckRun,
  hasActiveChangesRequest,
  hasRequiredSuccessfulChecks,
  isActionsSubmissionPullRequest,
  isRegistryOnlyPullRequest,
  type PullRequestFile,
  type PullRequestReview,
  reconcilePullRequest,
} from "./barista.ts"

const successfulChecks: CheckRun[] = [
  {
    name: "All checks passed",
    status: "completed",
    conclusion: "success",
    app: { slug: "github-actions" },
  },
  {
    name: "Registry admission",
    status: "completed",
    conclusion: "success",
    app: { slug: "github-actions" },
  },
]

describe("Barista registry path policy", () => {
  it("accepts added and modified flat registry entries", () => {
    const files: PullRequestFile[] = [
      { filename: "registry/new-plugin.json", status: "added" },
      { filename: "registry/existing-plugin.json", status: "modified" },
    ]

    expect(isRegistryOnlyPullRequest(files)).toBe(true)
  })

  it("rejects mixed, nested, renamed, and removed changes", () => {
    expect(
      isRegistryOnlyPullRequest([
        { filename: "registry/new-plugin.json", status: "added" },
        { filename: "scripts/scan.ts", status: "modified" },
      ])
    ).toBe(false)
    expect(
      isRegistryOnlyPullRequest([
        { filename: "registry/nested/new-plugin.json", status: "added" },
      ])
    ).toBe(false)
    expect(
      isRegistryOnlyPullRequest([
        {
          filename: "registry/new-plugin.json",
          previous_filename: "registry/old-plugin.json",
          status: "renamed",
        },
      ])
    ).toBe(false)
    expect(
      isRegistryOnlyPullRequest([
        { filename: "registry/old-plugin.json", status: "removed" },
      ])
    ).toBe(false)
  })
})

describe("Barista check policy", () => {
  it("accepts the two current successful GitHub Actions checks", () => {
    expect(hasRequiredSuccessfulChecks(successfulChecks)).toBe(true)
  })

  it("fails closed for missing, pending, or foreign checks", () => {
    expect(hasRequiredSuccessfulChecks(successfulChecks.slice(0, 1))).toBe(
      false
    )
    expect(
      hasRequiredSuccessfulChecks([
        ...successfulChecks.slice(0, 1),
        {
          ...successfulChecks[1],
          status: "in_progress",
          conclusion: null,
        },
      ])
    ).toBe(false)
    expect(
      hasRequiredSuccessfulChecks([
        ...successfulChecks.slice(0, 1),
        {
          ...successfulChecks[1],
          app: { slug: "untrusted-app" },
        },
      ])
    ).toBe(false)
  })
})

describe("Barista held-run approval policy", () => {
  it("approves only deterministic github-actions submission branches", () => {
    expect(
      isActionsSubmissionPullRequest(
        "github-actions[bot]",
        "plugin-submission/issue-42"
      )
    ).toBe(true)
    expect(
      isActionsSubmissionPullRequest(
        "contributor",
        "plugin-submission/issue-42"
      )
    ).toBe(false)
    expect(
      isActionsSubmissionPullRequest("github-actions[bot]", "feature/registry")
    ).toBe(false)
  })
})

describe("Barista review policy", () => {
  it("uses each reviewer's latest state", () => {
    const resolvedRequest: PullRequestReview[] = [
      { user: { login: "reviewer" }, state: "CHANGES_REQUESTED" },
      { user: { login: "reviewer" }, state: "APPROVED" },
    ]
    expect(hasActiveChangesRequest(resolvedRequest)).toBe(false)
    expect(
      hasActiveChangesRequest([
        ...resolvedRequest,
        { user: { login: "other-reviewer" }, state: "CHANGES_REQUESTED" },
      ])
    ).toBe(true)
  })
})

function reconciliationContext(heads: string[]) {
  const createReview = vi.fn()
  const merge = vi.fn()
  const approveWorkflowRun = vi.fn()
  const listFiles = vi.fn()
  const listReviews = vi.fn()
  const listWorkflowRunsForRepo = vi.fn()
  const listForRef = vi.fn()
  const pulls = {
    createReview,
    get: vi.fn(async () => ({
      data: {
        base: { ref: "main" },
        draft: false,
        head: {
          ref: "plugin-submission/issue-42",
          sha: heads.shift() ?? "head",
        },
        state: "open",
        user: { login: "github-actions[bot]" },
      },
    })),
    listFiles,
    listReviews,
    merge,
  }
  const octokit = {
    paginate: vi.fn(async (method) => {
      if (method === listFiles) {
        return [{ filename: "registry/example.json", status: "added" }]
      }
      if (method === listWorkflowRunsForRepo) {
        return [{ id: 17, pull_requests: [{ number: 42 }] }]
      }
      if (method === listForRef) return successfulChecks
      if (method === listReviews) return []
      throw new Error("Unexpected paginated endpoint")
    }),
    rest: {
      actions: { approveWorkflowRun, listWorkflowRunsForRepo },
      apps: {
        getAuthenticated: vi.fn(async () => ({ data: { slug: "barista" } })),
      },
      checks: { listForRef },
      pulls,
    },
  }
  return {
    calls: { approveWorkflowRun, createReview, merge },
    context: {
      octokit,
      payload: { repository: { default_branch: "main" } },
      repo: () => ({ owner: "paseo-cafe", repo: "paseo-cafe" }),
    },
  }
}

describe("Barista privileged reconciliation", () => {
  it("approves the held submission run, then approves and merges the current head", async () => {
    const { calls, context } = reconciliationContext(["head", "head", "head"])

    await reconcilePullRequest(context as never, 42)

    expect(calls.approveWorkflowRun).toHaveBeenCalledWith({
      owner: "paseo-cafe",
      repo: "paseo-cafe",
      run_id: 17,
    })
    expect(calls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ commit_id: "head", event: "APPROVE" })
    )
    expect(calls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ merge_method: "squash", sha: "head" })
    )
  })

  it("never approves or merges a head that changed during reconciliation", async () => {
    const { calls, context } = reconciliationContext(["head", "new-head"])

    await reconcilePullRequest(context as never, 42)

    expect(calls.createReview).not.toHaveBeenCalled()
    expect(calls.merge).not.toHaveBeenCalled()
  })
})
