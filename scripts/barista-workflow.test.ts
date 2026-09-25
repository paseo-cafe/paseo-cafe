import { readFile } from "node:fs/promises"
import { beforeAll, describe, expect, it } from "vitest"
import { parse } from "yaml"

type WorkflowStep = {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, unknown>
  env?: Record<string, string>
}

type Workflow = {
  on: Record<string, unknown>
  jobs: Record<string, { steps: WorkflowStep[] }>
}

async function workflow(path: string): Promise<Workflow> {
  return parse(await readFile(path, "utf8")) as Workflow
}

describe("Barista workflows", () => {
  let submission: Workflow
  let reconciliation: Workflow

  beforeAll(async () => {
    ;[submission, reconciliation] = await Promise.all([
      workflow(".github/workflows/plugin-submission.yml"),
      workflow(".github/workflows/barista.yml"),
    ])
  })

  it("processes issues without trusting a contributor-managed label", () => {
    expect(submission.on.issues).toEqual({ types: ["opened", "edited"] })
    expect(JSON.stringify(submission)).not.toContain("plugin-submission')")
  })

  it("runs reconciliation after PR updates and prerequisite workflow completion", () => {
    expect(reconciliation.on).toHaveProperty("pull_request_target")
    expect(reconciliation.on).toHaveProperty("workflow_run")
  })

  it("checks out trusted default-branch code before installing dependencies", () => {
    for (const workflowDefinition of [submission, reconciliation]) {
      const steps = Object.values(workflowDefinition.jobs).flatMap(
        (job) => job.steps
      )
      const checkout = steps.find((step) =>
        step.uses?.startsWith("actions/checkout@")
      )
      expect(checkout?.with?.ref).toBe(
        "$" + "{{ github.event.repository.default_branch }}"
      )
      expect(checkout?.with?.["persist-credentials"]).toBe(false)
      const install = steps.find(
        (step) => step.run === "bun install --frozen-lockfile"
      )
      expect(steps.indexOf(checkout as WorkflowStep)).toBeLessThan(
        steps.indexOf(install as WorkflowStep)
      )
    }
  })

  it("mints narrowed Barista tokens rather than using the workflow token", () => {
    for (const workflowDefinition of [submission, reconciliation]) {
      const token = Object.values(workflowDefinition.jobs)
        .flatMap((job) => job.steps)
        .find((step) => step.name === "Create Barista token")
      expect(token?.uses).toContain("actions/create-github-app-token@")
      expect(token?.with?.["app-id"]).toBe("$" + "{{ secrets.BARISTA_APP_ID }}")
      expect(token?.with?.["private-key"]).toBe(
        "$" + "{{ secrets.BARISTA_APP_PEM }}"
      )
    }
  })

  it("uses the default token only to author submission PRs", () => {
    const submit = submission.jobs.submit
    const run = submit?.steps.find(
      (step) => step.name === "Process submission issue"
    )
    expect(run?.env?.GITHUB_TOKEN).toBe(
      "$" + "{{ steps.barista.outputs.token }}"
    )
    expect(run?.env?.GITHUB_PR_CREATOR_TOKEN).toBe("$" + "{{ github.token }}")
  })

  it("grants Barista Actions write access only for held-run approval", () => {
    const token = reconciliation.jobs.reconcile?.steps.find(
      (step) => step.name === "Create Barista token"
    )
    expect(token?.with?.["permission-actions"]).toBe("write")
  })
})
