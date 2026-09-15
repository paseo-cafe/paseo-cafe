import { describe, expect, it } from "vitest"
import {
  existingRegistryId,
  resolveSubmissionState,
  runCaptured,
} from "./plugin-submission.ts"

describe("plugin submission state", () => {
  it("uses an issue-stable branch for a new submission", () => {
    expect(resolveSubmissionState(42, [])).toEqual({
      branch: "plugin-submission/issue-42",
      mode: "create",
    })
  })

  it("updates the existing open pull request after an issue edit", () => {
    expect(
      resolveSubmissionState(42, [
        { number: 101, state: "OPEN", mergedAt: null },
      ])
    ).toEqual({
      branch: "plugin-submission/issue-42",
      mode: "update",
      pullRequestNumber: 101,
    })
  })

  it("stops when the issue pull request was closed without merging", () => {
    expect(
      resolveSubmissionState(42, [
        { number: 101, state: "CLOSED", mergedAt: null },
      ])
    ).toEqual({
      branch: "plugin-submission/issue-42",
      mode: "closed",
      pullRequestNumber: 101,
    })
  })

  it("treats a merged issue pull request as complete", () => {
    expect(
      resolveSubmissionState(42, [
        {
          number: 101,
          state: "MERGED",
          mergedAt: "2026-09-15T00:00:00Z",
        },
      ])
    ).toEqual({
      branch: "plugin-submission/issue-42",
      mode: "merged",
      pullRequestNumber: 101,
    })
  })

  it("identifies the prior entry so changing ids removes it", () => {
    expect(
      existingRegistryId(["registry/old-plugin.json", "unrelated-file.txt"])
    ).toBe("old-plugin")
  })
})

describe("plugin submission command capture", () => {
  it("surfaces stderr from an unexpected generator failure", async () => {
    const result = await runCaptured([
      process.execPath,
      "-e",
      'console.error("unexpected generator failure"); process.exit(1)',
    ])

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("unexpected generator failure")
  })
})
