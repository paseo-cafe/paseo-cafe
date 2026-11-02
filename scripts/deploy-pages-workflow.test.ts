import { readFile } from "node:fs/promises"
import { beforeAll, describe, expect, it } from "vitest"
import { parse } from "yaml"

type Workflow = {
  on: Record<string, unknown>
  jobs: {
    build: {
      if: string
      steps: Array<{ run?: string }>
    }
  }
}

describe("frozen-catalog Pages deployment", () => {
  let workflow: Workflow

  beforeAll(async () => {
    workflow = parse(
      await readFile(".github/workflows/deploy-pages.yml", "utf8")
    ) as Workflow
  })

  it("accepts workflow_run deployments only from a default-branch push", () => {
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

  it("builds from the committed catalog without scheduled registry scans", () => {
    expect(workflow.on.schedule).toBeUndefined()
    const commands = workflow.jobs.build.steps.flatMap((step) =>
      step.run ? [step.run] : []
    )
    expect(commands.some((run) => /registry:|security:/.test(run))).toBe(false)
  })
})
