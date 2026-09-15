#!/usr/bin/env bun
/**
 * Turns a "Add a plugin" issue form submission into a registry entry.
 *
 * Invoked by .github/workflows/plugin-submission.yml with the raw issue body
 * (ISSUE_BODY) and author (ISSUE_AUTHOR) as environment variables. Parses the
 * GitHub issue-form field markers, validates the result against the same
 * registryEntrySchema the manual PR path enforces, and writes
 * registry/<id>.json. Never trusts issue text into a shell command or path
 * without going through registryIdSchema/registryEntrySchema first.
 *
 * On failure, prints a human-readable error to stdout and exits non-zero; the
 * workflow posts that message back to the issue and stops before touching git.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  CATEGORIES,
  registryEntrySchema,
  registryIdSchema,
} from "../src/lib/registry-schema.ts"

const REGISTRY_DIR = process.env.REGISTRY_DIR ?? join(process.cwd(), "registry")

const body = process.env.ISSUE_BODY ?? ""
const author = process.env.ISSUE_AUTHOR ?? ""

/** Issue forms render each field as "### <label>" followed by the answer. */
function extractField(label: string): string {
  const pattern = new RegExp(
    `### ${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n+([\\s\\S]*?)(?=\\n### |$)`
  )
  const match = pattern.exec(body)
  const value = match?.[1]?.trim() ?? ""
  return value === "_No response_" ? "" : value
}

/** Dropdown (multiple) answers render as a single comma-separated line. */
function splitList(value: string): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

/** Caveats textarea: one caveat per non-empty line. */
function splitLines(value: string): string[] {
  if (!value) return []
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function fail(message: string): never {
  console.log(message)
  process.exit(1)
}

const rawId = extractField("Registry filename (id)")
const rawRepo = extractField("GitHub repository")
const rawPath = extractField("Subpath (optional)")
const rawCategories = extractField("Categories")
const rawPlatforms = extractField("Platforms (only if platform-restricted)")
const rawCaveats = extractField("Caveats")

const categories = splitList(rawCategories)
const unknownCategories = categories.filter(
  (category) => !(CATEGORIES as readonly string[]).includes(category)
)
if (unknownCategories.length > 0) {
  fail(
    `Unknown categories: ${unknownCategories.join(", ")}. Valid categories: ${CATEGORIES.join(", ")}.`
  )
}

const idResult = registryIdSchema.safeParse(rawId)
if (!idResult.success) {
  fail(
    `Registry filename "${rawId}" is invalid: ${idResult.error.issues[0]?.message}`
  )
}
const id = idResult.data

const registryPath = join(REGISTRY_DIR, `${id}.json`)
if (existsSync(registryPath)) {
  fail(
    `registry/${id}.json already exists. Pick a different id or edit it in a PR instead.`
  )
}

const entryResult = registryEntrySchema.safeParse({
  repo: rawRepo,
  ...(rawPath ? { path: rawPath } : {}),
  categories,
  platforms: splitList(rawPlatforms),
  caveats: splitLines(rawCaveats),
  ...(author ? { submittedBy: author } : {}),
})

if (!entryResult.success) {
  const issues = entryResult.error.issues
    .map((issue) => `- ${issue.path.join(".") || "entry"}: ${issue.message}`)
    .join("\n")
  fail(`Registry entry is invalid:\n${issues}`)
}

mkdirSync(REGISTRY_DIR, { recursive: true })
writeFileSync(registryPath, `${JSON.stringify(entryResult.data, null, 2)}\n`)

// Consumed by the workflow to name the branch/PR and report success back.
console.log(`REGISTRY_ID=${id}`)
