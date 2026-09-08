import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { RpcInput, RpcOutput } from "@getpaseo/plugin"
import { z } from "zod"
import type { directoryInstallRpc, directoryListRpc } from "../shared/directory"
import {
  DEFAULT_DIRECTORY_URL,
  directoryEntrySchema,
  isValidInstallPath,
  isValidRepo,
} from "../shared/directory"

const execFileAsync = promisify(execFile)

const CACHE_TTL_MS = 5 * 60 * 1000
const directoryResponseSchema = z.object({
  plugins: z.array(directoryEntrySchema),
})

// Keyed by resolved URL so switching the directorySettings override (e.g. to
// a local dev server) doesn't serve a stale production-fetched cache, or vice
// versa.
const cache = new Map<
  string,
  { fetchedAt: number; plugins: z.infer<typeof directoryEntrySchema>[] }
>()

function resolveDirectoryUrl(baseUrl: string | undefined): string {
  // PASEO_CAFE_DIRECTORY_URL is a lower-priority escape hatch for environments
  // where the daemon's own env is easier to control than the plugin's
  // settings (e.g. scripted daemon setups) — the settings override above
  // normally wins since it's reachable from the running app.
  return (
    baseUrl || process.env.PASEO_CAFE_DIRECTORY_URL || DEFAULT_DIRECTORY_URL
  )
}

async function fetchDirectory(baseUrl: string | undefined) {
  const url = resolveDirectoryUrl(baseUrl)
  const now = Date.now()
  const cached = cache.get(url)
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.plugins

  // Manual AbortController instead of AbortSignal.timeout(): this plugin
  // typechecks without the DOM lib, which is where that static lives.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  let response: Response
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`)
  }
  const body = directoryResponseSchema.parse(await response.json())
  cache.set(url, { fetchedAt: now, plugins: body.plugins })
  return body.plugins
}

export async function listDirectory(
  input: RpcInput<typeof directoryListRpc>
): Promise<RpcOutput<typeof directoryListRpc>> {
  const plugins = await fetchDirectory(input.baseUrl)
  return { plugins, fetchedAt: new Date().toISOString() }
}

export async function installDirectoryPlugin(
  input: RpcInput<typeof directoryInstallRpc>
): Promise<RpcOutput<typeof directoryInstallRpc>> {
  const { repo, path } = input

  // Re-validated here even though the client only ever sends entries straight
  // from fetchDirectory(): this is the boundary that actually shells out, and
  // it shouldn't trust the network response (or any other RPC caller) blindly.
  if (!isValidRepo(repo)) {
    return {
      ok: false,
      message: `"${repo}" doesn't look like a GitHub "owner/repo".`,
    }
  }
  if (path !== undefined && !isValidInstallPath(path)) {
    return { ok: false, message: `"${path}" isn't a valid plugin subpath.` }
  }

  const args = ["plugin", "add", repo, ...(path ? ["--path", path] : [])]
  try {
    // execFile, not exec/shell — args are passed as an array straight to the
    // process, so there's no shell to inject into even though repo/path
    // ultimately came from a remote JSON response.
    const { stdout } = await execFileAsync("paseo", args, { timeout: 120_000 })
    return { ok: true, message: stdout.trim() || `Installed ${repo}.` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, message: message.slice(0, 500) }
  }
}
