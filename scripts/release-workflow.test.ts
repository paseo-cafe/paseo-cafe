import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"

type WorkflowStep = {
  name?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type WorkflowJob = {
  if?: string
  needs?: string[]
  steps: WorkflowStep[]
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

  it("publishes tested plugin changes from main on the next tag", async () => {
    const workflow = parse(
      await readFile(".github/workflows/ci.yml", "utf8")
    ) as {
      jobs: {
        changes: { outputs: Record<string, string> }
        "plugin-preview": WorkflowJob
        "all-checks": WorkflowJob
      }
    }
    const preview = workflow.jobs["plugin-preview"]
    const version = preview.steps.find(
      (step) => step.name === "Assign unique preview version"
    )
    const publish = preview.steps.find(
      (step) => step.name === "Publish npm package on next tag"
    )

    expect(workflow.jobs.changes.outputs.plugin_package).toContain(
      "outputs.plugin_package"
    )
    expect(preview.needs).toEqual(["changes", "plugin"])
    expect(preview.if).toContain("github.repository == 'paseo-cafe/paseo-cafe'")
    expect(preview.if).toContain("github.event_name == 'push'")
    expect(preview.if).toContain("github.ref == 'refs/heads/main'")
    expect(preview.if).toContain(
      "needs.changes.outputs.plugin_package == 'true'"
    )
    expect(preview.if).toContain("needs.plugin.result == 'success'")
    expect(version?.run).toContain("npm version prerelease")
    const previewIdentifier =
      '--preid="next.' +
      "$" +
      "{GITHUB_RUN_ID}." +
      "$" +
      '{GITHUB_RUN_ATTEMPT}"'
    expect(version?.run).toContain(previewIdentifier)
    expect(publish?.run).toContain("npm publish")
    expect(publish?.run).toContain("--tag next")
    expect(workflow.jobs["all-checks"].needs).toContain("plugin-preview")
  })
})
