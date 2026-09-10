import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { RpcInput, RpcOutput } from "@getpaseo/plugin"
import { z } from "zod"
import type {
  DirectoryEntry,
  directoryInstallRpc,
  directoryListRpc,
  directorySearchRpc,
  directoryUpdateRpc,
  directoryUpdateStatusRpc,
  InstalledPlugin,
} from "../shared/directory"
import {
  DEFAULT_DIRECTORY_URL,
  directoryEntrySchema,
  findInstallations,
  getInstallCommand,
  getSiteUrl,
  HEALTH_LABELS,
  installedPluginSchema,
  isTrustedCatalogUrl,
  isValidInstallPath,
  isValidRepo,
  stripHtml,
} from "../shared/directory"

const execFileAsync = promisify(execFile)

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_INSTALL_ERROR_LENGTH = 32_000
const ANSI_ESCAPE_PATTERN = new RegExp(
  `${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`,
  "g"
)
const directoryResponseSchema = z.object({
  plugins: z.array(directoryEntrySchema).max(500),
  generatedAt: z.iso.datetime({ offset: true, local: true }).optional(),
})
const pluginUpdateResponseSchema = z.array(
  z.object({
    id: z.string(),
    updated: z.boolean(),
    previousCommit: z.string(),
    currentCommit: z.string(),
    commits: z.number().int().nonnegative(),
  })
)
const TRACKED_BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
const UPDATE_STATUS_TTL_MS = 60_000
const UPDATE_CHECK_CONCURRENCY = 4
const GIT_ENV = { GIT_TERMINAL_PROMPT: "0" }
const updateStatusCache = new Map<
  string,
  { expiresAt: number; value: Promise<InstalledPlugin> }
>()

export function buildPaseoInvocation(
  args: readonly string[],
  platform = process.platform,
  env = process.env
): { executable: string; args: string[]; env: NodeJS.ProcessEnv } {
  const childEnv = { ...env }
  // A plugin subprocess launched by the packaged Electron app inherits this.
  // Passing it back to the AppImage makes Electron treat "plugin" as a Node
  // entrypoint instead of dispatching the Paseo CLI.
  delete childEnv.ELECTRON_RUN_AS_NODE
  if (platform !== "win32") {
    return { executable: "paseo", args: [...args], env: childEnv }
  }
  const tokens = ["paseo", ...args].map((value) => {
    if (
      value.includes(String.fromCharCode(0)) ||
      value.includes('"') ||
      /[\r\n&|<>()^%!]/.test(value)
    ) {
      throw new Error(
        "Paseo CLI argument contains unsupported Windows shell characters"
      )
    }
    return `"${value}"`
  })
  return {
    executable: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", tokens.join(" ")],
    env: childEnv,
  }
}

async function execPaseo(args: readonly string[], timeout: number) {
  const invocation = buildPaseoInvocation(args)
  return execFileAsync(invocation.executable, invocation.args, {
    timeout,
    env: invocation.env,
  })
}

async function execGit(
  cwd: string,
  args: readonly string[],
  timeout = 15_000
): Promise<{ stdout: string; exitCode: number }> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      env: { ...process.env, ...GIT_ENV },
      timeout,
    })
    return { stdout, exitCode: 0 }
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: unknown }
    if (typeof failure.code !== "number") throw error
    return {
      stdout: typeof failure.stdout === "string" ? failure.stdout : "",
      exitCode: failure.code,
    }
  }
}

type GitRunner = typeof execGit

export async function inspectUpdateStatus(
  installation: InstalledPlugin,
  runGit: GitRunner = execGit
): Promise<InstalledPlugin> {
  if (
    installation.source !== "git" ||
    !installation.ref ||
    !installation.commit ||
    !TRACKED_BRANCH_PATTERN.test(installation.ref) ||
    installation.ref.includes("..")
  ) {
    return { ...installation, updateState: "unknown" }
  }
  const branchRef = `refs/remotes/origin/${installation.ref}`
  try {
    const tracked = await runGit(installation.path, [
      "show-ref",
      "--verify",
      "--quiet",
      branchRef,
    ])
    if (tracked.exitCode === 1) {
      if (/^[0-9a-f]{40,64}$/i.test(installation.ref)) {
        return { ...installation, updateState: "pinned" }
      }
      const tag = await runGit(installation.path, [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/tags/${installation.ref}`,
      ])
      if (tag.exitCode === 0) return { ...installation, updateState: "pinned" }
      throw new Error("Tracked branch is unavailable")
    }
    if (tracked.exitCode !== 0)
      throw new Error("Could not inspect tracked branch")
    const fetched = await runGit(
      installation.path,
      ["fetch", "--prune", "--tags", "origin"],
      120_000
    )
    if (fetched.exitCode !== 0) throw new Error("Could not fetch plugin source")
    const latest = await runGit(installation.path, [
      "rev-parse",
      "--verify",
      branchRef,
    ])
    const latestCommit = latest.stdout.trim()
    if (latest.exitCode !== 0 || !/^[0-9a-f]{40,64}$/i.test(latestCommit)) {
      throw new Error("Could not resolve tracked branch")
    }
    if (latestCommit === installation.commit) {
      return { ...installation, latestCommit, updateState: "current" }
    }
    const ancestor = await runGit(installation.path, [
      "merge-base",
      "--is-ancestor",
      installation.commit,
      latestCommit,
    ])
    return {
      ...installation,
      latestCommit,
      updateState: ancestor.exitCode === 0 ? "available" : "diverged",
    }
  } catch (error) {
    return {
      ...installation,
      updateState: "unknown",
      updateError: commandFailureMessage(error),
    }
  }
}

async function cachedUpdateStatus(
  installation: InstalledPlugin
): Promise<InstalledPlugin> {
  const key = `${installation.path}\u0000${installation.ref ?? ""}\u0000${installation.commit ?? ""}`
  const now = Date.now()
  const cached = updateStatusCache.get(key)
  if (cached && cached.expiresAt > now) return cached.value
  if (updateStatusCache.size >= 500) {
    for (const [cachedKey, entry] of updateStatusCache) {
      if (entry.expiresAt <= now) updateStatusCache.delete(cachedKey)
    }
    if (updateStatusCache.size >= 500) {
      const oldestKey = updateStatusCache.keys().next().value
      if (oldestKey !== undefined) updateStatusCache.delete(oldestKey)
    }
  }
  const value = inspectUpdateStatus(installation)
  updateStatusCache.set(key, { expiresAt: now + UPDATE_STATUS_TTL_MS, value })
  return value
}

export async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  limit: number,
  mapper: (value: Input) => Promise<Output>
): Promise<Output[]> {
  const output = new Array<Output>(values.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++
      output[index] = await mapper(values[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker())
  )
  return output
}

async function addUpdateStatus(
  plugins: readonly DirectoryEntry[],
  installations: readonly InstalledPlugin[]
): Promise<InstalledPlugin[]> {
  const matched = new Map<string, InstalledPlugin>()
  for (const entry of plugins) {
    for (const installation of findInstallations(entry, installations)) {
      if (installation.source === "git")
        matched.set(installation.id, installation)
    }
  }
  const checked = await mapWithConcurrency(
    [...matched.values()],
    UPDATE_CHECK_CONCURRENCY,
    cachedUpdateStatus
  )
  const byId = new Map(
    checked.map((installation) => [installation.id, installation])
  )
  return installations.map(
    (installation) => byId.get(installation.id) ?? installation
  )
}

function commandFailureMessage(error: unknown): string {
  const failure = error as {
    message?: unknown
    stderr?: unknown
    stdout?: unknown
  }
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  const details = [
    text(failure.message).split("\n")[0] ?? "",
    text(failure.stderr),
    text(failure.stdout),
  ]
    .filter((value) => value.trim().length > 0)
    .join("\n\n")
    .replace(ANSI_ESCAPE_PATTERN, "")
    .trim()
  const message = details || String(error)
  return message.length > MAX_INSTALL_ERROR_LENGTH
    ? `${message.slice(0, MAX_INSTALL_ERROR_LENGTH)}\n\n[Output truncated by Paseo Cafe]`
    : message
}

async function listInstalledPlugins() {
  const { stdout } = await execPaseo(["plugin", "ls", "--json"], 30_000)
  return z.array(installedPluginSchema).max(500).parse(JSON.parse(stdout))
}

// Keyed by resolved URL so switching the directorySettings override (e.g. to
// a local dev server) doesn't serve a stale production-fetched cache, or vice
// versa.
const cache = new Map<
  string,
  {
    receivedAt: number
    fetchedAt: string
    plugins: z.infer<typeof directoryEntrySchema>[]
  }
>()
let warnedAboutRejectedDirectoryUrl = false

function resolveDirectoryUrl(baseUrl: string | undefined): string {
  // PASEO_CAFE_DIRECTORY_URL is a lower-priority escape hatch for contexts that
  // cannot persist plugin settings yet (CI, headless smoke tests). The settings
  // override wins because it is reachable from the running app.
  if (baseUrl) {
    if (!isTrustedCatalogUrl(baseUrl)) {
      throw new Error("Catalog URL must use HTTPS, or HTTP on localhost.")
    }
    return baseUrl
  }
  const fromEnv = process.env.PASEO_CAFE_DIRECTORY_URL
  if (!fromEnv) return DEFAULT_DIRECTORY_URL
  // Unlike the settings value this never passed a schema, so it gets the same
  // transport check here; a rejected value falls back instead of silently
  // pointing the install button at an unauthenticated catalog.
  if (isTrustedCatalogUrl(fromEnv)) return fromEnv
  if (!warnedAboutRejectedDirectoryUrl) {
    console.error(
      "Ignoring PASEO_CAFE_DIRECTORY_URL: catalog URL must use HTTPS, or HTTP on localhost."
    )
    warnedAboutRejectedDirectoryUrl = true
  }
  return DEFAULT_DIRECTORY_URL
}

async function fetchDirectory(baseUrl: string | undefined, force = false) {
  const url = resolveDirectoryUrl(baseUrl)
  const now = Date.now()
  const cached = cache.get(url)
  if (!force && cached && now - cached.receivedAt < CACHE_TTL_MS) return cached

  // Manual AbortController instead of AbortSignal.timeout(): this plugin
  // typechecks without the DOM lib, which is where that static lives.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  let response: Response
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      headers: { accept: "application/json" },
    })
  } finally {
    clearTimeout(timeout)
  }
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`)
  }
  const body = directoryResponseSchema.parse(await response.json())
  const result = {
    receivedAt: now,
    fetchedAt: body.generatedAt ?? new Date(now).toISOString(),
    plugins: body.plugins,
  }
  cache.set(url, result)
  return result
}

export async function listDirectory(
  input: RpcInput<typeof directoryListRpc>
): Promise<RpcOutput<typeof directoryListRpc>> {
  const [directory, installed] = await Promise.all([
    fetchDirectory(input.baseUrl, input.force),
    listInstalledPlugins().then(
      (installations) => ({ installations }),
      (error) => ({ installationError: commandFailureMessage(error) })
    ),
  ])
  return {
    plugins: directory.plugins,
    fetchedAt: directory.fetchedAt,
    ...installed,
  }
}

export async function listDirectoryUpdateStatus(
  input: RpcInput<typeof directoryUpdateStatusRpc>
): Promise<RpcOutput<typeof directoryUpdateStatusRpc>> {
  const [directory, installations] = await Promise.all([
    fetchDirectory(input.baseUrl),
    listInstalledPlugins(),
  ])
  return {
    installations: await addUpdateStatus(directory.plugins, installations),
  }
}

function attachmentText(entry: DirectoryEntry): string {
  const healthText = entry.health
    ? Object.entries(HEALTH_LABELS)
        .map(
          ([key, label]) =>
            `- ${entry.health?.[key as keyof NonNullable<DirectoryEntry["health"]>] === true ? "Pass" : "Missing"}: ${label}`
        )
        .join("\n")
    : "Not reported"
  return [
    `# ${entry.name}`,
    entry.description,
    `Repository: ${entry.repo}`,
    `Repository URL: ${entry.url}`,
    `Install: ${getInstallCommand(entry)}`,
    entry.paseoVersionRequirement
      ? `Paseo requirement: ${entry.paseoVersionRequirement}`
      : null,
    entry.platforms.length ? `Platforms: ${entry.platforms.join(", ")}` : null,
    entry.categories.length
      ? `Categories: ${entry.categories.join(", ")}`
      : null,
    entry.caveats.length
      ? `Caveats:\n${entry.caveats.map((item) => `- ${item}`).join("\n")}`
      : null,
    entry.limitationsNotesHtml
      ? `Limitations from README: ${stripHtml(entry.limitationsNotesHtml)}`
      : null,
    entry.installNotesHtml
      ? `Install notes from README: ${stripHtml(entry.installNotesHtml)}`
      : null,
    entry.scanError ? `Directory scan error: ${entry.scanError}` : null,
    `Health checks:\n${healthText}`,
    `Directory page: ${getSiteUrl(entry)}`,
    "Paseo plugins are trusted, unsandboxed code. Review the source before installing.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n")
}

export async function searchDirectory(
  input: RpcInput<typeof directorySearchRpc>
): Promise<RpcOutput<typeof directorySearchRpc>> {
  const { plugins } = await fetchDirectory(undefined)
  const query = input.query.trim().toLowerCase()
  const matches = plugins
    .filter((entry) => {
      if (!query) return true
      return [
        entry.id,
        entry.name,
        entry.description,
        entry.repo,
        entry.author,
        ...entry.categories,
        ...entry.platforms,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLowerCase()
        .includes(query)
    })
    .sort((a, b) => (b.repoMeta?.stars ?? 0) - (a.repoMeta?.stars ?? 0))
    .slice(0, 20)

  return {
    items: matches.map((entry) => ({
      id: entry.id,
      identifier: entry.id,
      title: entry.name,
      subtitle: entry.repo,
      url: getSiteUrl(entry),
      text: attachmentText(entry),
      resourceType: "Paseo plugin",
    })),
  }
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
    // Arguments are passed as an array on Unix and strictly quoted through
    // cmd.exe for npm's paseo.cmd shim on Windows.
    const { stdout } = await execPaseo(args, 120_000)
    return { ok: true, message: stdout.trim() || `Installed ${repo}.` }
  } catch (error) {
    return { ok: false, message: commandFailureMessage(error) }
  }
}

export async function updateDirectoryPlugin(
  input: RpcInput<typeof directoryUpdateRpc>
): Promise<RpcOutput<typeof directoryUpdateRpc>> {
  const { entry, pluginId } = input
  if (!isValidRepo(entry.repo)) {
    return {
      ok: false,
      message: `"${entry.repo}" isn't a valid catalog repository.`,
    }
  }
  if (entry.path !== undefined && !isValidInstallPath(entry.path)) {
    return {
      ok: false,
      message: `"${entry.path}" isn't a valid plugin subpath.`,
    }
  }
  if (entry.id === "paseo-cafe") {
    return {
      ok: false,
      message: `Update Paseo Cafe outside the running plugin: paseo plugin update ${pluginId}`,
    }
  }
  try {
    const installed = await listInstalledPlugins()
    const target = findInstallations(entry, installed).find(
      (installation) =>
        installation.id === pluginId && installation.source === "git"
    )
    if (!target) {
      return {
        ok: false,
        message: `Installed plugin ${pluginId} does not match ${entry.repo}${entry.path ? `/${entry.path}` : ""}.`,
      }
    }
    const checked = await inspectUpdateStatus(target)
    if (checked.updateState !== "available") {
      return {
        ok: false,
        message:
          checked.updateState === "current"
            ? `${pluginId} is already up to date.`
            : `Update status for ${pluginId} is ${checked.updateState}.`,
      }
    }
    const { stdout } = await execPaseo(
      ["plugin", "update", pluginId, "--json"],
      120_000
    )
    const [result] = pluginUpdateResponseSchema.parse(JSON.parse(stdout))
    if (!result) {
      return { ok: false, message: `No update result for ${pluginId}.` }
    }
    updateStatusCache.clear()
    return {
      ok: true,
      updated: result.updated,
      message: result.updated
        ? `Updated ${pluginId} by ${result.commits} commit${result.commits === 1 ? "" : "s"}.`
        : `${pluginId} is already up to date.`,
    }
  } catch (error) {
    return { ok: false, message: commandFailureMessage(error) }
  }
}
