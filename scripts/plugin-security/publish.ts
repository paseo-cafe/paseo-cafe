#!/usr/bin/env bun
import { appendFileSync, readFileSync } from "node:fs"
import {
  REPORT_DETAILS_CLOSE,
  REPORT_DETAILS_OPEN,
  REPORT_SUMMARY_CLOSE,
  REPORT_SUMMARY_OPEN,
} from "./shared.ts"

export const REPORT_MARKER = "<!-- paseo-plugin-security-report -->"
const MAX_COMMENT_LENGTH = 60_000
const MAX_REPORT_LENGTH = MAX_COMMENT_LENGTH - `${REPORT_MARKER}\n`.length
const TRUNCATION_NOTICE = "\n\n_Report truncated._"
const REPORT_MARKUP: Record<string, string> = {
  [REPORT_DETAILS_OPEN]: "<details>",
  [REPORT_DETAILS_CLOSE]: "</details>",
  [REPORT_SUMMARY_OPEN]: "<summary>",
  [REPORT_SUMMARY_CLOSE]: "</summary>",
}

type PullRequestEvent = {
  pull_request?: { number?: number }
}

type PublishOptions = {
  report: string
  event: PullRequestEvent
  eventName?: string
  repository?: string
  token?: string
  summaryPath?: string
  fetcher?: typeof fetch
}

export async function publishReport(options: PublishOptions): Promise<void> {
  const body = `${REPORT_MARKER}\n${boundedReport(options.report)}`
  if (options.summaryPath) appendFileSync(options.summaryPath, `${body}\n`)

  const number = options.event.pull_request?.number
  if (options.eventName !== "pull_request_target" || !number) return
  if (!options.token)
    throw new Error("GITHUB_TOKEN is required for PR publishing")
  if (!options.repository || !/^[\w.-]+\/[\w.-]+$/.test(options.repository)) {
    throw new Error("GITHUB_REPOSITORY must be owner/repo")
  }

  const fetcher = options.fetcher ?? fetch
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${options.token}`,
    "content-type": "application/json",
    "user-agent": "paseo-plugin-security",
    "x-github-api-version": "2022-11-28",
  }
  const commentsUrl = `https://api.github.com/repos/${options.repository}/issues/${number}/comments`
  let existingId: number | undefined
  for (let page = 1; page <= 10 && existingId === undefined; page += 1) {
    const response = await fetcher(`${commentsUrl}?per_page=100&page=${page}`, {
      headers,
    })
    if (!response.ok)
      throw new Error(`GitHub comments API error ${response.status}`)
    const comments = (await response.json()) as Array<{
      id?: unknown
      body?: unknown
    }>
    const existing = comments.find(
      (comment) =>
        typeof comment.id === "number" &&
        typeof comment.body === "string" &&
        comment.body.includes(REPORT_MARKER)
    )
    if (existing) existingId = existing.id as number
    if (comments.length < 100) break
  }

  const url = existingId
    ? `https://api.github.com/repos/${options.repository}/issues/comments/${existingId}`
    : commentsUrl
  const response = await fetcher(url, {
    method: existingId ? "PATCH" : "POST",
    headers,
    body: JSON.stringify({ body }),
  })
  if (!response.ok)
    throw new Error(`GitHub comment publish error ${response.status}`)
}

export function boundedReport(report: string): string {
  let sanitized = report
    .replaceAll("\0", "")
    .replaceAll("@", "@\u200b")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
  for (const [token, markup] of Object.entries(REPORT_MARKUP)) {
    sanitized = sanitized.replaceAll(token, markup)
  }
  if (sanitized.length <= MAX_REPORT_LENGTH) return sanitized

  const budget = MAX_REPORT_LENGTH - TRUNCATION_NOTICE.length
  const lineBreak = sanitized.lastIndexOf("\n", budget)
  const end = lineBreak > 0 ? lineBreak : budget
  return `${sanitized.slice(0, end)}${TRUNCATION_NOTICE}`
}

async function main() {
  const [reportPath, eventPath] = process.argv.slice(2)
  if (!reportPath || !eventPath) {
    throw new Error("usage: publish <report.md> <event.json>")
  }
  await publishReport({
    report: readFileSync(reportPath, "utf8"),
    event: JSON.parse(readFileSync(eventPath, "utf8")) as PullRequestEvent,
    eventName: process.env.GITHUB_EVENT_NAME,
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN,
    summaryPath: process.env.GITHUB_STEP_SUMMARY,
  })
}

if (import.meta.main) await main()
