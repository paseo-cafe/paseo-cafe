import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it } from "vitest"

const cli = fileURLToPath(new URL("./targets.ts", import.meta.url))
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "security-target-cli-"))
  roots.push(root)
  const output = join(root, "targets.json")
  const githubOutput = join(root, "github-output.txt")
  const preload = join(root, "fetch.mjs")
  writeFileSync(
    preload,
    `globalThis.fetch = async (url) => {
      if (url !== "https://api.github.com/repos/owner/example/commits/HEAD")
        throw new Error("Unexpected network request: " + url)
      return new Response(JSON.stringify({ sha: "${"a".repeat(40)}" }))
    }`
  )
  return {
    root,
    output,
    githubOutput,
    run(args: string[]) {
      return spawnSync(
        "bun",
        ["--preload", preload, cli, ...args, "--output", output],
        {
          cwd: root,
          env: { PATH: process.env.PATH, GITHUB_OUTPUT: githubOutput },
          encoding: "utf8",
          timeout: 10_000,
        }
      )
    },
  }
}

describe("security:targets CLI registry path", () => {
  it.each([undefined, "relative registry"])(
    "reads an empty registry with the default or relative path: %s",
    (registryPath) => {
      const f = fixture()
      mkdirSync(join(f.root, registryPath ?? "registry"))
      const result = f.run(registryPath ? ["--registry", registryPath] : [])
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(readFileSync(f.output, "utf8"))).toEqual({
        version: 1,
        targets: [],
      })
      expect(readFileSync(f.githubOutput, "utf8")).toBe("count=0\n")
    }
  )

  it("reads the absolute registry path used by admission and resolves its target", () => {
    const f = fixture()
    const registry = join(f.root, "runner temp", "registry")
    mkdirSync(registry, { recursive: true })
    writeFileSync(
      join(registry, "example.json"),
      JSON.stringify({ repo: "owner/example", path: "plugins/example" })
    )
    const result = f.run(["--registry", registry])
    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(readFileSync(f.output, "utf8"))).toEqual({
      version: 1,
      targets: [
        {
          id: "example",
          repo: "owner/example",
          path: "plugins/example",
          ref: "a".repeat(40),
          commit: "a".repeat(40),
        },
      ],
    })
    expect(readFileSync(f.githubOutput, "utf8")).toBe("count=1\n")
  })

  it("fails for a missing registry instead of emitting a clean empty result", () => {
    const f = fixture()
    const result = f.run(["--registry", join(f.root, "missing")])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("ENOENT")
    expect(existsSync(f.output)).toBe(false)
    expect(existsSync(f.githubOutput)).toBe(false)
  })

  it("still validates entries reached through an absolute registry path", () => {
    const f = fixture()
    const registry = join(f.root, "registry")
    mkdirSync(registry)
    writeFileSync(join(registry, "example.json"), "{not json}")
    const result = f.run(["--registry", registry])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("JSON")
    expect(result.stderr).not.toContain("ENOENT")
    expect(existsSync(f.output)).toBe(false)
    expect(existsSync(f.githubOutput)).toBe(false)
  })
})
