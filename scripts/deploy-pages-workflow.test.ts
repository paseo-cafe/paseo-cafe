import { readFile } from "node:fs/promises"
import { beforeAll, describe, expect, it } from "vitest"
import { parse } from "yaml"

type WorkflowStep = {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}

type Workflow = {
  on: {
    schedule?: Array<{ cron: string }>
    workflow_dispatch: {
      inputs: { state_run_id: { required: boolean; type: string } }
    }
  }
  concurrency: { group: string; "cancel-in-progress": boolean }
  jobs: {
    build: {
      if: string
      "runs-on": string
      permissions: Record<string, string>
      outputs: Record<string, string>
      steps: WorkflowStep[]
    }
    deploy: {
      if: string
      steps: WorkflowStep[]
    }
  }
}
const dollar = "$"
const expression = (value: string) => `${dollar}{{ ${value} }}`

describe("incremental Pages deployment", () => {
  let workflow: Workflow
  let buildSteps: WorkflowStep[]
  let deploySteps: WorkflowStep[]

  beforeAll(async () => {
    workflow = parse(
      await readFile(".github/workflows/deploy-pages.yml", "utf8")
    ) as Workflow
    buildSteps = workflow.jobs.build.steps
    deploySteps = workflow.jobs.deploy.steps
  })

  it("accepts workflow_run deployments only from a default-branch push", () => {
    expect(workflow.jobs.build["runs-on"]).toBe("ubuntu-latest")
    expect(workflow.jobs.build.if).toContain(
      "github.event.workflow_run.event == 'push'"
    )
    expect(workflow.jobs.build.if).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository"
    )
    expect(workflow.jobs.build.if).toContain(
      "github.event.workflow_run.head_branch == github.event.repository.default_branch"
    )
  })

  it("polls npm every fifteen minutes without cancelling full scans", () => {
    expect(workflow.on.schedule).toEqual([
      { cron: "7,22,37,52 * * * *" },
      { cron: "13 */6 * * *" },
    ])
    expect(workflow.concurrency).toEqual({
      group: "github-pages",
      "cancel-in-progress": false,
    })
  })

  it("restores state only from a previously deployed workflow run", () => {
    expect(workflow.jobs.build.permissions.actions).toBe("read")
    const find = buildSteps.find(
      (step) => step.name === "Find last deployed registry state"
    )
    const restore = buildSteps.find(
      (step) => step.name === "Restore last deployed registry state"
    )
    expect(find?.run).toBe("bun run scripts/find-scan-state.ts")
    expect(find?.env?.GITHUB_DEFAULT_BRANCH).toBe(
      expression("github.event.repository.default_branch")
    )
    expect(restore).toMatchObject({
      if: "inputs.state_run_id == '' && steps.prior.outputs.found == 'true'",
      with: {
        name: "registry-scan-state-v1",
        path: "data",
        "github-token": expression("github.token"),
        "run-id": expression("steps.prior.outputs.run_id"),
      },
    })
  })

  it("can restore candidate state without deploying it", () => {
    expect(workflow.on.workflow_dispatch.inputs.state_run_id).toMatchObject({
      required: false,
      type: "string",
    })
    const restore = buildSteps.find(
      (step) => step.name === "Restore candidate state for plan-only testing"
    )
    const decision = buildSteps.find(
      (step) => step.name === "Decide whether to deploy"
    )
    expect(restore).toMatchObject({
      if: "github.event_name == 'workflow_dispatch' && inputs.state_run_id != ''",
      with: {
        name: `registry-scan-candidate-${expression("inputs.state_run_id")}`,
        path: "data",
        "github-token": expression("github.token"),
        "run-id": expression("inputs.state_run_id"),
      },
    })
    expect(decision?.env?.DEPLOY).toContain("inputs.state_run_id == ''")
  })

  it("pins once, scans candidates, and verifies the plan before assembly", () => {
    const planIndex = buildSteps.findIndex(
      (step) => step.name === "Build pinned registry plan"
    )
    const scanIndex = buildSteps.findIndex(
      (step) => step.name === "Scan changed plugin releases"
    )
    const verifyIndex = buildSteps.findIndex(
      (step) => step.name === "Reject stale scan completions"
    )
    const assembleIndex = buildSteps.findIndex(
      (step) =>
        step.name === "Assemble registry from active and candidate releases"
    )
    expect(planIndex).toBeGreaterThan(-1)
    expect(scanIndex).toBeGreaterThan(planIndex)
    expect(verifyIndex).toBeGreaterThan(scanIndex)
    expect(assembleIndex).toBeGreaterThan(verifyIndex)
    expect(buildSteps[scanIndex]?.if).toBe(
      "steps.plan.outputs.scan_count != '0'"
    )
    expect(buildSteps[assembleIndex]?.env).toEqual({
      GITHUB_TOKEN: expression("github.token"),
      VITE_SITE_URL: expression("steps.pages.outputs.base_url"),
      VITE_BASE_PATH: expression("steps.pages.outputs.base_path"),
    })
  })

  it("publishes trusted state only after Pages deployment succeeds", () => {
    expect(workflow.jobs.deploy.if).toBe("needs.build.outputs.deploy == 'true'")
    const deployIndex = deploySteps.findIndex(
      (step) => step.name === "Deploy to GitHub Pages"
    )
    const publishIndex = deploySteps.findIndex(
      (step) => step.name === "Publish deployed registry state"
    )
    expect(deployIndex).toBeGreaterThan(-1)
    expect(publishIndex).toBeGreaterThan(deployIndex)
    expect(deploySteps[publishIndex]?.with).toMatchObject({
      name: "registry-scan-state-v1",
      path: "data/registry-scan-state.json",
      "if-no-files-found": "error",
    })
  })
})
