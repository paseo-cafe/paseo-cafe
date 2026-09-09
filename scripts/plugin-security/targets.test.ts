import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { selectTargets, writeCount } from "./targets.ts"

const responses = new Map<string, unknown>()
const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = (async (url: string) => {
    const body = responses.get(url)
    if (body === undefined) return new Response("not found", { status: 404 })
    return typeof body === "string"
      ? new Response(body, { status: 200 })
      : new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
})

afterEach(() => {
  responses.clear()
  globalThis.fetch = originalFetch
  delete process.env.GITHUB_OUTPUT
})

describe("selectTargets", () => {
  it("selects checked-out registry entries for non-pr runs", async () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const registry = join(root, "registry")
    mkdirSync(registry)
    writeFileSync(
      join(registry, "one.json"),
      JSON.stringify({ id: "one", repo: "o/r" })
    )
    expect(await selectTargets({ registryRoot: registry })).toEqual([
      { id: "one", repo: "o/r", ref: "HEAD", commit: "HEAD", path: undefined },
    ])
  })

  it("selects only changed PR entries", async () => {
    const root = mkdtempSync(join(tmpdir(), "plugin-security-"))
    const registry = join(root, "registry")
    mkdirSync(registry)
    writeFileSync(
      join(registry, "one.json"),
      JSON.stringify({ id: "one", repo: "o/r" })
    )
    const eventPath = join(root, "event.json")
    writeFileSync(
      eventPath,
      JSON.stringify({
        action: "opened",
        pull_request: {
          base: { sha: "base-sha", repo: { full_name: "a/base" } },
          head: { sha: "head-sha", repo: { full_name: "a/head" } },
        },
      })
    )
    responses.set(
      "https://api.github.com/repos/a/base/contents/registry?ref=base-sha",
      [{ name: "one.json", path: "registry/one.json", type: "file" }]
    )
    responses.set(
      "https://api.github.com/repos/a/head/contents/registry?ref=head-sha",
      [
        { name: "one.json", path: "registry/one.json", type: "file" },
        { name: "two.json", path: "registry/two.json", type: "file" },
      ]
    )
    responses.set(
      "https://raw.githubusercontent.com/a/base/base-sha/registry/one.json",
      JSON.stringify({ id: "one", repo: "o/r", path: "src" })
    )
    responses.set(
      "https://raw.githubusercontent.com/a/head/head-sha/registry/one.json",
      JSON.stringify({ id: "one", repo: "o/r", path: "src" })
    )
    responses.set(
      "https://raw.githubusercontent.com/a/head/head-sha/registry/two.json",
      JSON.stringify({ id: "two", repo: "o/r2" })
    )
    responses.set("https://api.github.com/repos/o/r", {
      default_branch: "main",
    })
    responses.set("https://api.github.com/repos/o/r/git/ref/heads/main", {
      object: { sha: "commit-one" },
    })
    responses.set("https://api.github.com/repos/o/r2", {
      default_branch: "main",
    })
    responses.set("https://api.github.com/repos/o/r2/git/ref/heads/main", {
      object: { sha: "commit-two" },
    })

    await expect(
      selectTargets({ registryRoot: registry, eventPath, githubToken: "token" })
    ).resolves.toEqual([
      {
        id: "two",
        repo: "o/r2",
        path: undefined,
        ref: "commit-two",
        commit: "commit-two",
      },
    ])
  })

  it("writes count lines to GITHUB_OUTPUT", () => {
    const output = join(
      mkdtempSync(join(tmpdir(), "plugin-security-")),
      "out.txt"
    )
    process.env.GITHUB_OUTPUT = output
    writeCount(3)
    expect(readFileSync(output, "utf8")).toContain("count=3")
  })
})
