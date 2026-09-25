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
  "run-name": string
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: {
    admission: {
      name: string
      steps: WorkflowStep[]
    }
  }
}

const dollar = "$"
const expression = (value: string) => `${dollar}{{ ${value} }}`
const shellVariable = (name: string) => `${dollar}{${name}}`

describe("registry admission workflow", () => {
  let workflow: Workflow
  let steps: WorkflowStep[]

  beforeAll(async () => {
    workflow = parse(
      await readFile(".github/workflows/plugin-security.yml", "utf8")
    ) as Workflow
    steps = workflow.jobs.admission.steps
  })

  it("keeps native pull request checks and limits the synthetic check to dispatches", () => {
    expect(workflow.on).toHaveProperty("pull_request_target")
    expect(workflow.on).toHaveProperty("workflow_dispatch")
    expect(workflow.jobs.admission.name).toBe("Registry admission")
    expect(workflow["run-name"]).toBe(
      `Registry admission PR #${expression("github.event.pull_request.number || inputs.pr_number")}`
    )
    expect(workflow.permissions.checks).toBe("write")

    const createCheck = steps.find(
      (step) => step.name === "Create dispatched PR check"
    )
    expect(createCheck?.if).toBe("github.event_name == 'workflow_dispatch'")
  })

  it("attaches the dispatched check to the resolved PR head without checking it out", () => {
    const createCheck = steps.find(
      (step) => step.name === "Create dispatched PR check"
    )
    const checkout = steps.find(
      (step) => step.name === "Check out trusted admission code"
    )

    expect(createCheck).toMatchObject({
      id: "check",
      env: { HEAD_SHA: expression("steps.pr.outputs.head_sha") },
    })
    expect(createCheck?.run).toContain('--arg name "Registry admission"')
    expect(createCheck?.run).toContain("name: $name")
    expect(createCheck?.run).toContain("head_sha: $head_sha")
    expect(createCheck?.run).toContain('status: "in_progress"')
    expect(createCheck?.run).toContain(
      `"repos/${shellVariable("GITHUB_REPOSITORY")}/check-runs"`
    )
    expect(checkout?.with?.ref).toBe(expression("steps.pr.outputs.base_sha"))
    expect(
      steps.filter((step) => step.uses?.startsWith("actions/checkout@"))
    ).toHaveLength(1)
  })

  it("always completes a created check from the enforced job outcome", () => {
    const enforceIndex = steps.findIndex(
      (step) => step.name === "Enforce admission result"
    )
    const completeIndex = steps.findIndex(
      (step) => step.name === "Complete dispatched PR check"
    )
    const completeCheck = steps[completeIndex]

    expect(completeIndex).toBeGreaterThan(enforceIndex)
    expect(completeCheck?.if).toBe(
      "always() && github.event_name == 'workflow_dispatch' && steps.check.outputs.id != ''"
    )
    expect(completeCheck?.env?.JOB_STATUS).toBe(expression("job.status"))
    expect(completeCheck?.run).toContain("conclusion=success")
    expect(completeCheck?.run).toContain("conclusion=cancelled")
    expect(completeCheck?.run).toContain("conclusion=failure")
    expect(completeCheck?.run).toContain('status: "completed"')
    expect(completeCheck?.run).toContain(
      `"repos/${shellVariable("GITHUB_REPOSITORY")}/check-runs/${shellVariable("CHECK_ID")}"`
    )
  })
})
