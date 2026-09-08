#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { registryEntrySchema } from "../../src/lib/registry-schema.ts"
import type { SecurityTarget } from "./shared.ts"

const eventSchema = z.object({
  action: z.string().optional(),
  pull_request: z
    .object({
      head: z.object({
        sha: z.string(),
        repo: z.object({ full_name: z.string() }),
      }),
      base: z.object({
        sha: z.string(),
        repo: z.object({ full_name: z.string() }),
      }),
    })
    .optional(),
})

type ContentsEntry = { name: string; path: string; type: string }
type RegistrySnapshotEntry = {
  id: string
  repo: string
  path?: string
  fingerprint: string
}

export async function selectTargets(opts: {
  registryRoot: string
  eventPath?: string
  githubToken?: string
}): Promise<SecurityTarget[]> {
  const local = readLocalRegistry(opts.registryRoot)
  if (!opts.eventPath) return local.map((entry) => toTarget(entry, "HEAD"))
  const event = eventSchema.parse(
    JSON.parse(readFileSync(opts.eventPath, "utf8"))
  )
  const pr = event.pull_request
  if (
    !pr ||
    !["opened", "synchronize", "reopened"].includes(event.action ?? "")
  ) {
    return local.map((entry) => toTarget(entry, "HEAD"))
  }
  return selectPullRequestTargets(
    local,
    pr.base.repo.full_name,
    pr.base.sha,
    pr.head.repo.full_name,
    pr.head.sha,
    opts.githubToken
  )
}

async function selectPullRequestTargets(
  local: Array<{ id: string; repo: string; path?: string }>,
  baseRepo: string,
  baseSha: string,
  headRepo: string,
  headSha: string,
  token?: string
): Promise<SecurityTarget[]> {
  const base = await readRegistrySnapshot(baseRepo, baseSha, token)
  const head = await readRegistrySnapshot(headRepo, headSha, token)
  const out = new Map<string, SecurityTarget>()
  for (const entry of local) out.set(key(entry), toTarget(entry, "HEAD"))
  for (const [identity, entry] of head.entries()) {
    if (base.get(identity)?.fingerprint !== entry.fingerprint) {
      out.set(identity, toTarget(entry, headSha))
    }
  }
  const targets = [...out.values()]
  writeCount(targets.length)
  return targets
}

function readLocalRegistry(root: string) {
  return readdirSync(root)
    .filter((file) => file.endsWith(".json"))
    .map((file) =>
      validateRegistryEntry(
        registryEntrySchema.parse(
          JSON.parse(readFileSync(join(root, file), "utf8"))
        )
      )
    )
}

async function readRegistrySnapshot(
  repoFullName: string,
  sha: string,
  token?: string
) {
  const [owner, repo] = repoFullName.split("/")
  const entries = z
    .array(z.object({ name: z.string(), path: z.string(), type: z.string() }))
    .parse(
      await fetchJson(
        `https://api.github.com/repos/${owner}/${repo}/contents/registry?ref=${encodeURIComponent(sha)}`,
        token
      )
    ) as ContentsEntry[]
  const out = new Map<string, RegistrySnapshotEntry>()
  for (const entry of entries) {
    if (
      entry.type !== "file" ||
      !entry.name.endsWith(".json") ||
      !safeRegistryPath(entry.path)
    )
      continue
    const raw = await fetchText(
      `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encodePath(entry.path)}`,
      token
    )
    const parsed = validateRegistryEntry(
      registryEntrySchema.parse(JSON.parse(raw))
    )
    const identity = key(parsed)
    out.set(identity, { ...parsed, fingerprint: raw })
  }
  return out
}

async function fetchJson(url: string, token?: string) {
  const res = await fetch(url, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`)
  return (await res.json()) as unknown
}

async function fetchText(url: string, token?: string) {
  const res = await fetch(url, { headers: githubHeaders(token) })
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`)
  return await res.text()
}

async function main() {
  const args = process.argv.slice(2)
  const outputPath = valueFor(args, "--output")
  if (!outputPath) throw new Error("missing --output")
  const registryRoot = join(
    process.cwd(),
    valueFor(args, "--registry") ?? "registry"
  )
  const eventPath = valueFor(args, "--event")
  const local = readLocalRegistry(registryRoot)
  const event = eventPath
    ? eventSchema.parse(
        JSON.parse(readFileSync(join(process.cwd(), eventPath), "utf8"))
      )
    : undefined
  const targets =
    event?.pull_request &&
    ["opened", "synchronize", "reopened"].includes(event.action ?? "")
      ? await selectPullRequestTargets(
          local,
          event.pull_request.base.repo.full_name,
          event.pull_request.base.sha,
          event.pull_request.head.repo.full_name,
          event.pull_request.head.sha,
          process.env.GITHUB_TOKEN
        )
      : local.map((entry) => toTarget(entry, "HEAD"))
  writeFileSync(
    outputPath,
    `${JSON.stringify({ version: 1, targets }, null, 2)}\n`
  )
}

if (import.meta.main) await main()

function githubHeaders(token?: string) {
  return {
    accept: "application/vnd.github+json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "x-github-api-version": "2022-11-28",
    "user-agent": "paseo-security-scanner",
  }
}
function validateRegistryEntry(entry: {
  id: string
  repo: string
  path?: string
}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id))
    throw new Error(`unsafe registry id ${entry.id}`)
  if (!/^[\w.-]+\/[\w.-]+$/.test(entry.repo))
    throw new Error(`unsafe repo ${entry.repo}`)
  if (entry.path && !safeRegistryPath(entry.path))
    throw new Error(`unsafe path ${entry.path}`)
  return entry
}
function safeRegistryPath(path: string) {
  return path
    .split("/")
    .every(
      (segment) =>
        segment &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("\\") &&
        !segment.includes(":")
    )
}
function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}
function toTarget(
  entry: { id: string; repo: string; path?: string },
  commit: string
): SecurityTarget {
  return {
    id: entry.id,
    repo: entry.repo,
    path: entry.path,
    ref: commit,
    commit,
  }
}
function key(target: { repo: string; path?: string }) {
  return `${target.repo}:${target.path ?? ""}`
}
function writeCount(count: number) {
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(process.env.GITHUB_OUTPUT, `count=${count}\n`, { flag: "a" })
}
function valueFor(argv: string[], flag: string) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
