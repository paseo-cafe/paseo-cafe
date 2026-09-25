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

const DEFAULT_REGISTRY_DIR = join(process.cwd(), "registry")

const ISSUE_FIELD_LABELS = [
  "Registry filename (id)",
  "GitHub repository",
  "Subpath (optional)",
  "npm package",
  "Categories",
  "Platforms (only if platform-restricted)",
  "Caveats",
  "Confirmations",
] as const

export type GeneratedRegistryEntry = {
  id: string
  content: string
}

/** Labels are metadata, not proof that an issue came from the submission form. */
export function isPluginSubmissionIssue(title: string, body: string): boolean {
  return (
    title.startsWith("Add plugin: ") &&
    ISSUE_FIELD_LABELS.every((label) => body.includes(`### ${label}`))
  )
}

/** Issue forms render each field as "### <label>" followed by the answer. */
function extractField(body: string, label: string): string {
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

/** Parses and validates issue-form fields into canonical registry JSON. */
export function generateRegistryEntryFromIssue(
  body: string,
  author: string
): GeneratedRegistryEntry {
  const rawId = extractField(body, "Registry filename (id)")
  const rawRepo = extractField(body, "GitHub repository")
  const rawPath = extractField(body, "Subpath (optional)")
  const rawPackage = extractField(body, "npm package")
  const rawCategories = extractField(body, "Categories")
  const rawPlatforms = extractField(
    body,
    "Platforms (only if platform-restricted)"
  )
  const rawCaveats = extractField(body, "Caveats")

  const categories = splitList(rawCategories)
  const unknownCategories = categories.filter(
    (category) => !(CATEGORIES as readonly string[]).includes(category)
  )
  if (unknownCategories.length > 0) {
    throw new Error(
      `Unknown categories: ${unknownCategories.join(", ")}. Valid categories: ${CATEGORIES.join(", ")}.`
    )
  }

  const idResult = registryIdSchema.safeParse(rawId)
  if (!idResult.success) {
    throw new Error(
      `Registry filename "${rawId}" is invalid: ${idResult.error.issues[0]?.message}`
    )
  }
  const id = idResult.data

  const entryResult = registryEntrySchema.safeParse({
    repo: rawRepo,
    ...(rawPath ? { path: rawPath } : {}),
    package: rawPackage,
    categories,
    platforms: splitList(rawPlatforms),
    caveats: splitLines(rawCaveats),
    ...(author ? { submittedBy: author } : {}),
  })

  if (!entryResult.success) {
    const issues = entryResult.error.issues
      .map((issue) => `- ${issue.path.join(".") || "entry"}: ${issue.message}`)
      .join("\n")
    throw new Error(`Registry entry is invalid:\n${issues}`)
  }

  return {
    id,
    content: `${JSON.stringify(entryResult.data, null, 2)}\n`,
  }
}

/** Preserves the standalone generator used by local tooling and recovery. */
function main(): void {
  const registryDir = process.env.REGISTRY_DIR ?? DEFAULT_REGISTRY_DIR
  const generated = generateRegistryEntryFromIssue(
    process.env.ISSUE_BODY ?? "",
    process.env.ISSUE_AUTHOR ?? ""
  )
  const registryPath = join(registryDir, `${generated.id}.json`)
  if (existsSync(registryPath)) {
    throw new Error(
      `registry/${generated.id}.json already exists. Pick a different id or edit it in a PR instead.`
    )
  }

  mkdirSync(registryDir, { recursive: true })
  writeFileSync(registryPath, generated.content)
  console.log(`REGISTRY_ID=${generated.id}`)
}

if (import.meta.main) {
  try {
    main()
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
