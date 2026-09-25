import { describe, expect, it } from "vitest"
import {
  generateRegistryEntryFromIssue,
  isPluginSubmissionIssue,
} from "./create-registry-entry-from-issue.ts"

const issueBody = `### Registry filename (id)

example-plugin

### GitHub repository

example/example-plugin

### Subpath (optional)

_No response_

### npm package

example-plugin

### Categories

github, productivity

### Platforms (only if platform-restricted)

_No response_

### Caveats

Requires a token

### Confirmations

- [x] The manifest plugin id matches the registry filename above.
- [x] The npm package is public and has a released semantic version.
`

describe("plugin submission issue form", () => {
  it("recognizes and generates an existing schema-valid submission", () => {
    expect(
      isPluginSubmissionIssue("Add plugin: example-plugin", issueBody)
    ).toBe(true)
    expect(generateRegistryEntryFromIssue(issueBody, "contributor")).toEqual({
      id: "example-plugin",
      content: `${JSON.stringify(
        {
          repo: "example/example-plugin",
          package: "example-plugin",
          categories: ["github", "productivity"],
          platforms: [],
          caveats: ["Requires a token"],
          submittedBy: "contributor",
        },
        null,
        2
      )}\n`,
    })
  })

  it("does not recognize arbitrary issues as submissions", () => {
    expect(isPluginSubmissionIssue("Question", issueBody)).toBe(false)
    expect(isPluginSubmissionIssue("Add plugin: example-plugin", "hello")).toBe(
      false
    )
  })
})
