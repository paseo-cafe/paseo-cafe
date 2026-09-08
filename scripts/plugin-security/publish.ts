#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs"

const [reportPath, eventPath] = process.argv.slice(2)
if (!reportPath || !eventPath) {
  throw new Error("usage: publish <report.md> <event.json>")
}

const report = readFileSync(reportPath, "utf8")
const event = JSON.parse(readFileSync(eventPath, "utf8")) as {
  action?: string
  pull_request?: { number?: number }
}
const summary = report.split("\n").slice(0, 400).join("\n")

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
}
if (
  event.action === "pull_request_target" &&
  event.pull_request?.number &&
  process.env.GITHUB_TOKEN
) {
  console.log(`marker comment for PR #${event.pull_request.number}`)
}
