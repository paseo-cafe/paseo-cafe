#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"
import { registryEntrySchema } from "../../src/lib/registry-schema.ts"
import type { SecurityTarget } from "./shared.ts"

const eventSchema = z.object({
  pull_request: z.object({ head: z.object({ sha: z.string() }) }).optional(),
})

export function selectTargets(opts: { registryRoot: string; eventPath?: string }): SecurityTarget[] {
  const event = opts.eventPath ? eventSchema.parse(JSON.parse(readFileSync(opts.eventPath, "utf8"))) : undefined
  const files = readdirSync(opts.registryRoot).filter((file) => file.endsWith(".json"))
  return files.map((file) => {
    const entry = registryEntrySchema.parse(JSON.parse(readFileSync(join(opts.registryRoot, file), "utf8")))
    const commit = event?.pull_request?.head.sha ?? "HEAD"
    return { id: entry.id, repo: entry.repo, ref: commit, commit, path: entry.path }
  })
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const eventPath = valueFor(args, "--event")
  const outputPath = valueFor(args, "--output")
  const registryRoot = valueFor(args, "--registry") ?? "registry"
  if (!outputPath) throw new Error("missing --output")
  if (!eventPath && registryRoot === "registry") throw new Error("missing --event")
  const targets = selectTargets({ registryRoot: join(process.cwd(), registryRoot), eventPath: eventPath ? join(process.cwd(), eventPath) : undefined })
  writeFileSync(outputPath, `${JSON.stringify({ version: 1, targets }, null, 2)}\n`)
}

function valueFor(argv: string[], flag: string) {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}
