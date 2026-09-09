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
} from "../shared/directory"
import {
  DEFAULT_DIRECTORY_URL,
  directoryEntrySchema,
  findInstallation,
  getInstallCommand,
  getSiteUrl,
  HEALTH_LABELS,
  installedPluginSchema,
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
  plugins: z.array(directoryEntrySchema),
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

async function addUpdateAvailability(
  plugins: readonly DirectoryEntry[],
  installations: readonly z.infer<typeof installedPluginSchema>[]
) {
  return Promise.all(
    installations.map(async (installation) => {
      if (
        installation.source !== "git" ||
        !installation.ref ||
        !installation.commit ||
        !TRACKED_BRANCH_PATTERN.test(installation.ref) ||
        installation.ref.includes("..")
      ) {
        return installation
      }
      const entry = plugins.find(
        (candidate) => findInstallation(candidate, [installation]) !== undefined
      )
      if (!entry || !isValidRepo(entry.repo)) return installation
      try {
        const { stdout } = await execFileAsync(
          "git",
          [
            "ls-remote",
            "--heads",
            `https://github.com/${entry.repo}.git`,
            `refs/heads/${installation.ref}`,
          ],
          { timeout: 15_000 }
        )
        const latestCommit = stdout.trim().split(/\s+/)[0]
        if (!/^[0-9a-f]{40,64}$/i.test(latestCommit ?? "")) return installation
        return {
          ...installation,
          latestCommit,
          updateAvailable: latestCommit !== installation.commit,
        }
      } catch {
        return installation
      }
    })
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
  const { stdout } = await execFileAsync("paseo", ["plugin", "ls", "--json"], {
    timeout: 30_000,
  })
  return z.array(installedPluginSchema).parse(JSON.parse(stdout))
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

function resolveDirectoryUrl(baseUrl: string | undefined): string {
  // PASEO_CAFE_DIRECTORY_URL is a lower-priority escape hatch for contexts that
  // cannot persist plugin settings yet (CI, headless smoke tests). The settings
  // override wins because it is reachable from the running app.
  return (
    baseUrl || process.env.PASEO_CAFE_DIRECTORY_URL || DEFAULT_DIRECTORY_URL
  )
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
      (error) => ({
        installations: [],
        installationError: commandFailureMessage(error),
      })
    ),
  ])
  const installations = await addUpdateAvailability(
    directory.plugins,
    installed.installations
  )
  const installationError =
    "installationError" in installed ? installed.installationError : undefined
  return {
    plugins: directory.plugins,
    fetchedAt: directory.fetchedAt,
    installations,
    ...(installationError ? { installationError } : {}),
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
    // execFile, not exec/shell — args are passed as an array straight to the
    // process, so there's no shell to inject into even though repo/path
    // ultimately came from a remote JSON response.
    const { stdout } = await execFileAsync("paseo", args, { timeout: 120_000 })
    return { ok: true, message: stdout.trim() || `Installed ${repo}.` }
  } catch (error) {
    return { ok: false, message: commandFailureMessage(error) }
  }
}

export async function updateDirectoryPlugin(
  input: RpcInput<typeof directoryUpdateRpc>
): Promise<RpcOutput<typeof directoryUpdateRpc>> {
  try {
    const { stdout } = await execFileAsync(
      "paseo",
      ["plugin", "update", input.pluginId, "--json"],
      { timeout: 120_000 }
    )
    const [result] = pluginUpdateResponseSchema.parse(JSON.parse(stdout))
    if (!result) {
      return { ok: false, message: `No update result for ${input.pluginId}.` }
    }
    return {
      ok: true,
      updated: result.updated,
      message: result.updated
        ? `Updated ${input.pluginId} by ${result.commits} commit${result.commits === 1 ? "" : "s"}.`
        : `${input.pluginId} is already up to date.`,
    }
  } catch (error) {
    return { ok: false, message: commandFailureMessage(error) }
  }
}
