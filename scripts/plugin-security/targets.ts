#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { z } from "zod"
import {
  registryEntrySchema,
  registryIdSchema,
} from "../../src/lib/registry-schema.ts"
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
  commit: string
}

export async function selectTargets(opts: {
  registryRoot: string
  eventPath?: string
  githubToken?: string
}): Promise<SecurityTarget[]> {
  const local = readLocalRegistry(opts.registryRoot)
  if (!opts.eventPath) return await resolveLocalTargets(local, opts.githubToken)
  const event = eventSchema.parse(
    JSON.parse(readFileSync(opts.eventPath, "utf8"))
  )
  const pr = event.pull_request
  if (
    !pr ||
    !["opened", "synchronize", "reopened", "ready_for_review"].includes(
      event.action ?? ""
    )
  ) {
    return await resolveLocalTargets(local, opts.githubToken)
  }
  return selectPullRequestTargets(
    pr.base.repo.full_name,
    pr.base.sha,
    pr.head.repo.full_name,
    pr.head.sha,
    opts.githubToken
  )
}

/**
 * Every registry entry checked out locally, each pinned to its repo's
 * current default-branch commit. This is the full-registry scan mode used
 * by the nightly/deploy pipeline (see deploy-pages.yml) — as opposed to
 * selectPullRequestTargets, which only re-scans entries a PR actually
 * changed. Resolving a real commit here (rather than a placeholder) keeps
 * every emitted SecurityPluginResult.commit a valid Git SHA even on a
 * clone failure, where scanTarget falls back to target.commit verbatim.
 */
async function resolveLocalTargets(
  entries: { id: string; repo: string; path?: string }[],
  token?: string
): Promise<SecurityTarget[]> {
  const targets: SecurityTarget[] = []
  for (const entry of entries) {
    const commit = await resolvePluginRepoRevision(entry.repo, token)
    targets.push(toTarget(entry, commit))
  }
  return targets
}

async function selectPullRequestTargets(
  baseRepo: string,
  baseSha: string,
  headRepo: string,
  headSha: string,
  token?: string
): Promise<SecurityTarget[]> {
  const base = await readRegistrySnapshot(baseRepo, baseSha, token)
  const head = await readRegistrySnapshot(headRepo, headSha, token)
  const targets: SecurityTarget[] = []
  for (const [identity, entry] of head.entries()) {
    if (base.get(identity)?.fingerprint !== entry.fingerprint) {
      targets.push(toTarget(entry, entry.commit))
    }
  }
  return targets
}

function readLocalRegistry(root: string) {
  return readdirSync(root)
    .filter((file) => file.endsWith(".json"))
    .map((file) =>
      parseRegistryFile(file, readFileSync(join(root, file), "utf8"))
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
    const parsed = parseRegistryFile(entry.name, raw)
    const identity = key(parsed)
    const commit = await resolvePluginRepoRevision(parsed.repo, token)
    out.set(identity, {
      ...parsed,
      fingerprint: `${parsed.id}\n${raw}`,
      commit,
    })
  }
  return out
}

async function resolvePluginRepoRevision(repo: string, token?: string) {
  const [owner, name] = repo.split("/")
  const commit = z
    .object({ sha: z.string() })
    .parse(
      await fetchJson(
        `https://api.github.com/repos/${owner}/${name}/commits/HEAD`,
        token
      )
    )
  return commit.sha
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
  const registryRoot = resolve(
    process.cwd(),
    valueFor(args, "--registry") ?? "registry"
  )
  const eventPath = valueFor(args, "--event")
  const targets = await selectTargets({
    registryRoot,
    eventPath,
    githubToken: process.env.GITHUB_TOKEN,
  })
  writeCount(targets.length)
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
function parseRegistryFile(file: string, raw: string) {
  const id = registryIdSchema.parse(basename(file, ".json"))
  const entry = registryEntrySchema.parse(JSON.parse(raw))
  return validateRegistryEntry({ ...entry, id })
}

function validateRegistryEntry(entry: {
  id: string
  repo: string
  path?: string
}) {
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
export function writeCount(count: number) {
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(process.env.GITHUB_OUTPUT, `count=${count}\n`, { flag: "a" })
}
function valueFor(argv: string[], flag: string) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
