import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"

type WorkflowStep = {
  name?: string
  if?: string
  uses?: string
  with?: Record<string, unknown>
}

describe("release workflow", () => {
  it("publishes the exact Release Please tag", async () => {
    const workflow = parse(
      await readFile(".github/workflows/release.yml", "utf8")
    ) as { jobs: { release: { steps: WorkflowStep[] } } }
    const steps = workflow.jobs.release.steps
    const checkout = steps.find(
      (step) => step.name === "Check out released source"
    )
    const publish = steps.find((step) => step.name === "Publish npm package")
    const releaseTagExpression =
      "$" + "{{ steps.release.outputs['plugin--tag_name'] }}"

    expect(checkout).toMatchObject({
      uses: expect.stringContaining("actions/checkout@"),
      with: { ref: releaseTagExpression },
    })
    expect(publish?.if).toBe(
      "steps.release.outputs['plugin--release_created'] == 'true'"
    )
  })
})
