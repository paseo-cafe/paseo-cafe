#!/usr/bin/env bun
import { readFileSync } from "node:fs"

const [reportPath, eventPath] = process.argv.slice(2)
if (!reportPath || !eventPath) throw new Error("usage: publish <report.md> <event.json>")
const report = readFileSync(reportPath, "utf8")
const event = JSON.parse(readFileSync(eventPath, "utf8")) as { pull_request?: { number?: number } }
console.log(report.split("\n").slice(0, 200).join("\n"))
if (event.pull_request?.number) console.log(`PR #${event.pull_request.number}`)
