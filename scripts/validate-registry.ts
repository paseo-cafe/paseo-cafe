#!/usr/bin/env bun
/**
 * CI gate run on every PR that touches registry/*.json. Checks are ordered
 * cheapest-first so a malformed entry fails fast without spending API calls:
 *
 *   1. JSON parses and matches registryEntrySchema
 *   2. filename matches the entry's id, ids are unique
 *   3. the repo/path actually exists on GitHub
 *   4. a valid paseo-plugin.json manifest exists at that path
 *
 * Exits non-zero (and prints a summary) if anything fails, which fails the
 * validate.yml workflow and blocks the PR from being merged.
 */
import { readdirSync, readFileSync } from "node:fs"
import { basename, join } from "node:path"
import { registryEntrySchema } from "../src/lib/registry-schema.ts"
import { fetchRawJson, GitHubNotFoundError, listDir } from "./github.ts"

// Scripts are always invoked via `bun run` from the repo root (see package.json).
const REGISTRY_DIR = join(process.cwd(), "registry")

interface Problem {
  file: string
  message: string
}

async function main() {
  const problems: Problem[] = []
  const seenIds = new Map<string, string>()

  const files = readdirSync(REGISTRY_DIR).filter((f) => f.endsWith(".json"))
  if (files.length === 0) {
    console.log("No registry entries found — nothing to validate.")
    return
  }

  for (const file of files) {
    const full = join(REGISTRY_DIR, file)
    const expectedId = basename(file, ".json")

    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(full, "utf8"))
    } catch (err) {
      problems.push({
        file,
        message: `invalid JSON: ${(err as Error).message}`,
      })
      continue
    }

    const parsed = registryEntrySchema.safeParse(raw)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          file,
          message: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
        })
      }
      continue
    }

    const entry = parsed.data
    if (entry.id !== expectedId) {
      problems.push({
        file,
        message: `id "${entry.id}" must match filename "${expectedId}.json"`,
      })
    }

    const existing = seenIds.get(entry.id)
    if (existing) {
      problems.push({
        file,
        message: `duplicate id "${entry.id}" (also used by ${existing})`,
      })
    } else {
      seenIds.set(entry.id, file)
    }

    const [owner, repo] = entry.repo.split("/")

    try {
      const dirEntries = await listDir(owner, repo, entry.path ?? "", "HEAD")
      const manifestEntry = dirEntries.find(
        (e) => e.name === "paseo-plugin.json"
      )
      if (!manifestEntry) {
        problems.push({
          file,
          message: `no paseo-plugin.json found in ${entry.repo}${entry.path ? `/${entry.path}` : ""}`,
        })
        continue
      }

      const manifestPath = entry.path
        ? `${entry.path}/paseo-plugin.json`
        : "paseo-plugin.json"
      const manifest = await fetchRawJson<{ id?: string }>(
        owner,
        repo,
        "HEAD",
        manifestPath
      )
      if (
        !manifest ||
        typeof manifest.id !== "string" ||
        manifest.id.length === 0
      ) {
        problems.push({
          file,
          message: `paseo-plugin.json at ${manifestPath} is missing a string "id" field`,
        })
      }
    } catch (err) {
      if (err instanceof GitHubNotFoundError) {
        problems.push({
          file,
          message: `repo/path not found: ${entry.repo}${entry.path ? `/${entry.path}` : ""}`,
        })
      } else {
        problems.push({
          file,
          message: `error checking ${entry.repo}: ${(err as Error).message}`,
        })
      }
    }
  }

  if (problems.length > 0) {
    console.error(`\n✗ ${problems.length} problem(s) found in registry/:\n`)
    for (const p of problems) console.error(`  ${p.file}: ${p.message}`)
    console.error("")
    process.exit(1)
  }

  console.log(
    `✓ ${files.length} registry entr${files.length === 1 ? "y" : "ies"} validated OK.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
