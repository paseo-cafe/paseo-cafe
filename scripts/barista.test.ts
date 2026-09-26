import { afterEach, describe, expect, it, vi } from "vitest"
import {
  barista,
  type CheckRun,
  dispatchRegistryAdmission,
  handleSubmissionIssue,
  hasActiveChangesRequest,
  hasRequiredSuccessfulChecks,
  isActionsSubmissionPullRequest,
  isRegistryOnlyPullRequest,
  type PullRequestReview,
  reconcilePullRequest,
  type WorkflowRunReference,
  workflowRunPullRequestNumbers,
} from "./barista.ts"

const registryAdmissionCheck: CheckRun = {
  name: "Registry admission",
  status: "completed",
  conclusion: "success",
  app: { slug: "github-actions" },
}
const successfulChecks: CheckRun[] = [
  {
    name: "All checks passed",
    status: "completed",
    conclusion: "success",
    app: { slug: "github-actions" },
  },
  registryAdmissionCheck,
]

const submissionBody = `### Registry filename (id)

existing-plugin

### GitHub repository

example/existing-plugin

### Subpath (optional)

_No response_

### npm package

existing-plugin

### Categories

productivity

### Platforms (only if platform-restricted)

_No response_

### Caveats

_No response_

### Confirmations

- [x] Confirmed
`

afterEach(() => vi.unstubAllEnvs())

describe("Barista registry path policy", () => {
  it("accepts only added flat registry entries", () => {
    expect(
      isRegistryOnlyPullRequest([
        { filename: "registry/new-plugin.json", status: "added" },
      ])
    ).toBe(true)
    expect(
      isRegistryOnlyPullRequest([
        { filename: "registry/existing-plugin.json", status: "modified" },
      ])
    ).toBe(false)
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

  it("allows generated submissions to rely on Registry admission", () => {
    expect(
      hasRequiredSuccessfulChecks([registryAdmissionCheck], {
        "Registry admission": true,
      })
    ).toBe(true)
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

describe("Barista workflow-run association", () => {
  it("recovers the PR number from a dispatched admission run title", () => {
    const workflowRun: WorkflowRunReference = {
      display_title: "Registry admission PR #42",
      event: "workflow_dispatch",
      name: "Registry admission PR #42",
      pull_requests: [],
    }
    expect(workflowRunPullRequestNumbers(workflowRun)).toEqual([42])
  })

  it("recovers the PR number when only the run name matches", () => {
    const workflowRun: WorkflowRunReference = {
      display_title: "Registry admission",
      event: "workflow_dispatch",
      name: "Registry admission PR #42",
      pull_requests: [],
    }
    expect(workflowRunPullRequestNumbers(workflowRun)).toEqual([42])
  })

  it("does not trust unrelated dispatched run titles", () => {
    const workflowRun: WorkflowRunReference = {
      display_title: "Deploy PR #42",
      event: "workflow_dispatch",
      name: "Deploy",
      pull_requests: [],
    }
    expect(workflowRunPullRequestNumbers(workflowRun)).toEqual([])
  })

  it("reconciles a dispatched admission run with a dynamic name", async () => {
    const { calls, context } = reconciliationContext(["head", "head", "head"])
    const handlers: Record<string, (event: never) => Promise<void>> = {}
    barista(
      {
        on: (
          events: string | string[],
          handler: (event: never) => Promise<void>
        ) => {
          for (const event of Array.isArray(events) ? events : [events]) {
            handlers[event] = handler
          }
        },
      } as never,
      {} as never
    )
    const handler = handlers["workflow_run.completed"]
    if (!handler) throw new Error("workflow_run.completed handler is missing")

    await handler({
      ...context,
      payload: {
        repository: { default_branch: "main" },
        workflow_run: {
          display_title: "Registry admission",
          event: "workflow_dispatch",
          name: "Registry admission PR #42",
          pull_requests: [],
        },
      },
    } as never)

    expect(calls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ commit_id: "head", event: "APPROVE" })
    )
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
        { user: { login: "reviewer" }, state: "CHANGES_REQUESTED" },
        { user: { login: "reviewer" }, state: "COMMENTED" },
      ])
    ).toBe(true)
    expect(
      hasActiveChangesRequest([
        ...resolvedRequest,
        { user: { login: "other-reviewer" }, state: "CHANGES_REQUESTED" },
      ])
    ).toBe(true)
  })
})

describe("Barista issue updates", () => {
  it("rejects an edited submission that changes to an existing registry id", async () => {
    const addLabels = vi.fn()
    const createComment = vi.fn()
    const list = vi.fn()
    const listFiles = vi.fn()
    const context = {
      octokit: {
        paginate: vi.fn(async (method) => {
          if (method === list) {
            return [{ merged_at: null, number: 41, state: "open" }]
          }
          if (method === listFiles) {
            return [{ filename: "registry/old-plugin.json", status: "added" }]
          }
          throw new Error("Unexpected paginated endpoint")
        }),
        rest: {
          issues: { addLabels, createComment },
          pulls: { list, listFiles },
          repos: { getContent: vi.fn(async () => ({ data: {} })) },
        },
      },
      payload: {
        issue: {
          body: submissionBody,
          number: 42,
          state: "open",
          title: "Add plugin: existing-plugin",
          user: { login: "contributor" },
        },
        repository: { default_branch: "main" },
      },
      repo: () => ({ owner: "paseo-cafe", repo: "paseo-cafe" }),
    }

    await handleSubmissionIssue(context as never)

    expect(createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining(
          "registry/existing-plugin.json already exists"
        ),
      })
    )
  })
})
function reconciliationContext(
  heads: string[],
  checks: CheckRun[] = successfulChecks
) {
  vi.stubEnv("BARISTA_APP_SLUG", "barista")
  const createReview = vi.fn()
  const createWorkflowDispatch = vi.fn()
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
  const workflowParameters: Record<string, unknown>[] = []
  const octokit = {
    paginate: vi.fn(async (method, parameters) => {
      if (method === listFiles) {
        return [{ filename: "registry/example.json", status: "added" }]
      }
      if (method === listWorkflowRunsForRepo) {
        workflowParameters.push(parameters as Record<string, unknown>)
        return [
          {
            id: 17,
            name: "CI",
            path: ".github/workflows/ci.yml",
            pull_requests: [{ number: 42 }],
          },
          {
            id: 18,
            name: "CI",
            path: ".github/workflows/deploy-pages.yml",
            pull_requests: [{ number: 42 }],
          },
        ]
      }
      if (method === listForRef) return checks
      if (method === listReviews) return []
      throw new Error("Unexpected paginated endpoint")
    }),
    rest: {
      actions: {
        approveWorkflowRun,
        createWorkflowDispatch,
        listWorkflowRunsForRepo,
      },
      checks: { listForRef },
      pulls,
    },
  }
  return {
    calls: {
      approveWorkflowRun,
      createReview,
      createWorkflowDispatch,
      merge,
      workflowParameters,
    },
    context: {
      octokit,
      payload: { repository: { default_branch: "main" } },
      repo: () => ({ owner: "paseo-cafe", repo: "paseo-cafe" }),
    },
  }
}

describe("Barista privileged reconciliation", () => {
  it("dispatches Registry admission for an Actions-authored submission PR", async () => {
    const { calls, context } = reconciliationContext(["head"])

    await dispatchRegistryAdmission(context as never, 42)

    expect(calls.createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "paseo-cafe",
      repo: "paseo-cafe",
      workflow_id: "plugin-security.yml",
      ref: "main",
      inputs: { pr_number: "42" },
    })
  })

  it("approves the held submission run, then approves and merges the current head", async () => {
    const { calls, context } = reconciliationContext(["head", "head", "head"])

    await reconcilePullRequest(context as never, 42)

    expect(calls.approveWorkflowRun).toHaveBeenCalledWith({
      owner: "paseo-cafe",
      repo: "paseo-cafe",
      run_id: 17,
    })
    expect(calls.workflowParameters).toEqual([
      expect.objectContaining({ head_sha: "head", status: "action_required" }),
    ])
    expect(calls.approveWorkflowRun).toHaveBeenCalledTimes(1)
    expect(calls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({ commit_id: "head", event: "APPROVE" })
    )
    expect(calls.merge).toHaveBeenCalledWith(
      expect.objectContaining({ merge_method: "squash", sha: "head" })
    )
  })

  it("approves generated submissions after Registry admission without a CI run", async () => {
    const { calls, context } = reconciliationContext(
      ["head", "head", "head"],
      [registryAdmissionCheck]
    )

    await reconcilePullRequest(context as never, 42)

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
