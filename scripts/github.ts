/**
 * Small, dependency-free GitHub REST API + raw-content helpers shared by
 * scripts/validate-registry.ts and scripts/scan.ts. Uses GITHUB_TOKEN when
 * present (set automatically inside GitHub Actions) to avoid the very low
 * unauthenticated rate limit; falls back to anonymous requests for local dev.
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
export const MAX_GITHUB_RAW_BYTES = 1 * 1_024 * 1_024

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {}),
    ...extra,
  }
}

export class GitHubNotFoundError extends Error {}

export async function ghApi<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: authHeaders({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    }),
  })
  if (res.status === 404) throw new GitHubNotFoundError(`404: ${path}`)
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(
      `GitHub API ${res.status} for ${path}: ${body.slice(0, 300)}`
    )
  }
  return res.json() as Promise<T>
}

export interface RepoMeta {
  full_name: string
  description: string | null
  default_branch: string
  stargazers_count: number
  open_issues_count: number
  pushed_at: string
  archived: boolean
  topics: string[]
  license: { spdx_id: string } | null
  html_url: string
  owner: { login: string; avatar_url: string; html_url: string }
}

export function fetchRepoMeta(owner: string, repo: string): Promise<RepoMeta> {
  return ghApi<RepoMeta>(`/repos/${owner}/${repo}`)
}

export interface ContentsEntry {
  name: string
  path: string
  type: "file" | "dir" | "symlink" | "submodule"
  download_url: string | null
}

export function listDir(
  owner: string,
  repo: string,
  path: string,
  ref: string
): Promise<ContentsEntry[]> {
  const cleanPath = path.replace(/^\/+|\/+$/g, "")
  const suffix = cleanPath ? `/${cleanPath}` : ""
  return ghApi<ContentsEntry[]>(
    `/repos/${owner}/${repo}/contents${suffix}?ref=${encodeURIComponent(ref)}`
  )
}

export function rawUrl(
  owner: string,
  repo: string,
  ref: string,
  path: string
): string {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
}

async function readBoundedRawText(
  response: Response,
  url: string
): Promise<string> {
  const contentLength = response.headers.get("content-length")
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_GITHUB_RAW_BYTES
  ) {
    throw new Error(
      `GitHub raw file exceeds ${MAX_GITHUB_RAW_BYTES} byte limit: ${url}`
    )
  }
  if (!response.body) return ""

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let receivedBytes = 0
  let parts: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    receivedBytes += value.byteLength
    if (receivedBytes > MAX_GITHUB_RAW_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error(
        `GitHub raw file exceeds ${MAX_GITHUB_RAW_BYTES} byte limit: ${url}`
      )
    }
    parts.push(decoder.decode(value, { stream: true }))
    if (parts.length >= 1_024) parts = [parts.join("")]
  }
  parts.push(decoder.decode())
  return parts.join("")
}

export async function fetchRawText(
  owner: string,
  repo: string,
  ref: string,
  path: string
): Promise<string | null> {
  const url = rawUrl(owner, repo, ref, path)
  const res = await fetch(url)
  if (!res.ok) return null
  return readBoundedRawText(res, url)
}

export async function fetchRawJson<T>(
  owner: string,
  repo: string,
  ref: string,
  path: string
): Promise<T | null> {
  const text = await fetchRawText(owner, repo, ref, path)
  if (text === null) return null
  return JSON.parse(text) as T
}

/**
 * Resolves the real MIME type behind a GitHub user-content asset URL
 * (e.g. github.com/user-attachments/assets/<uuid>), which carries no file
 * extension, so images and videos are indistinguishable by URL alone.
 * GitHub 302s these to a presigned S3 URL whose `response-content-type`
 * query param carries the real type — read straight off the redirect's
 * Location header without following it, so this costs one small request.
 */
export async function resolveGitHubAssetContentType(
  url: string
): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual" })
    const location = res.headers.get("location")
    if (location) {
      const type = new URL(location).searchParams.get("response-content-type")
      if (type) return type
    }
    return res.headers.get("content-type")
  } catch {
    return null
  }
}
