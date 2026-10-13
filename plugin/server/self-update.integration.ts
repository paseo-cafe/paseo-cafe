import assert from "node:assert/strict"
import { type ChildProcess, execFile, spawn } from "node:child_process"
import { once } from "node:events"
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, relative, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { DaemonClient } from "../node_modules/@getpaseo/client/dist/daemon-client.js"
import { execPaseo } from "./directory"

const execFileAsync = promisify(execFile)
const PREVIOUS_VERSION = "0.6.0"

interface PluginListItem {
  id: string
  path: string
  status: string
  installation?: { currentRevision?: string }
}

function parsePluginList(stdout: string): PluginListItem[] {
  return JSON.parse(stdout) as PluginListItem[]
}

async function waitFor(
  description: string,
  check: () => Promise<boolean>,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(
    `${description} timed out${lastError instanceof Error ? `: ${lastError.message}` : ""}`
  )
}

const SOURCE_FILES = [
  "index.server.ts",
  "server/directory.ts",
  "shared/directory.ts",
]

async function main(): Promise<void> {
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const home = await mkdtemp(join(tmpdir(), "paseo cafe ci self update-"))
  const binDir = join(home, "bin")
  const originalPath = process.env.PATH
  let daemon: ChildProcess | undefined
  let client: DaemonClient | undefined
  let daemonOutput = ""

  // An empty registry: the updated plugin only has to answer directory.list.
  const registryServer = createServer((request, response) => {
    if (request.url !== "/index.json") {
      response.writeHead(404).end()
      return
    }
    response.setHeader("content-type", "application/json")
    response.end(
      JSON.stringify({
        schemaVersion: 1,
        registry: { name: "CI registry", url: "http://127.0.0.1" },
        categories: [],
        featured: [],
        plugins: [],
        generatedAt: "2026-09-19T00:00:00.000Z",
      })
    )
  })

  try {
    await mkdir(binDir)
    registryServer.listen(0, "127.0.0.1")
    await once(registryServer, "listening")
    const address = registryServer.address()
    assert(address && typeof address !== "string")
    const registryUrl = `http://127.0.0.1:${address.port}`
    await writeFile(
      join(home, "config.json"),
      JSON.stringify({
        pluginsEnabled: true,
        features: {
          dictation: { enabled: false },
          voiceMode: { enabled: false },
        },
      })
    )
    const locator = process.platform === "win32" ? "where.exe" : "which"
    const located = await execFileAsync(locator, ["paseo"], { timeout: 10_000 })
    const realPaseo = located.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)
    assert(realPaseo, "paseo executable not found")

    const shim = join(
      binDir,
      process.platform === "win32" ? "paseo.cmd" : "paseo"
    )
    await writeFile(
      shim,
      process.platform === "win32"
        ? `@echo off\r\n"${realPaseo}" --home "${home}" %*\r\n`
        : `#!/bin/sh\nexec "${realPaseo}" --home "${home}" "$@"\n`,
      "utf8"
    )
    if (process.platform !== "win32") await chmod(shim, 0o755)
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ""}`

    const isWindows = process.platform === "win32"
    daemon = spawn(isWindows ? `"${shim}"` : shim, ["daemon", "run"], {
      env: process.env,
      shell: isWindows,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    for (const stream of [daemon.stdout, daemon.stderr]) {
      stream?.on("data", (chunk: Buffer) => {
        daemonOutput = `${daemonOutput}${chunk.toString("utf8")}`.slice(-32_000)
      })
    }

    await waitFor("isolated daemon readiness", async () => {
      const { stdout } = await execPaseo(["status", "--json"], 5_000)
      return JSON.parse(stdout).connectedDaemon === "reachable"
    })

    if (process.env.PASEO_CAFE_REQUIREMENTS_ONLY === "1") {
      const installed = await execPaseo(
        ["plugin", "add", relative(process.cwd(), pluginRoot) || ".", "--json"],
        120_000
      )
      const current = JSON.parse(installed.stdout) as PluginListItem
      assert.equal(current.status, "running")
      return
    }

    const installed = await execPaseo(
      ["plugin", "add", `npm:paseo-cafe@${PREVIOUS_VERSION}`, "--json"],
      120_000
    )
    const previous = JSON.parse(installed.stdout) as PluginListItem
    assert.equal(previous.status, "running")
    assert.equal(previous.installation?.currentRevision, PREVIOUS_VERSION)

    for (const relativePath of SOURCE_FILES) {
      await cp(
        join(pluginRoot, relativePath),
        join(previous.path, relativePath),
        {
          force: true,
        }
      )
    }
    await execPaseo(["plugin", "reload", "paseo-cafe", "--json"], 60_000)

    client = new DaemonClient({
      url: "ws://127.0.0.1:6767/ws",
      clientId: `self-update-ci-${crypto.randomUUID()}`,
      clientType: "browser",
      appVersion: "0.9.0-beta.2",
      reconnect: { enabled: false },
    })
    await client.connect()

    // The plugin updating itself stops its own process, so the RPC can only
    // acknowledge the handoff; the detached CLI finishes the update.
    const requested = (await client.invokePluginRpc(
      "paseo-cafe",
      "directory.update",
      { installationId: "paseo-cafe" }
    )) as { ok: boolean; message: string; restarting?: boolean }
    assert.equal(requested.ok, true, requested.message)
    assert.equal(requested.restarting, true)

    await waitFor(
      "updated plugin to load",
      async () => {
        const [plugin] = parsePluginList(
          (await execPaseo(["plugin", "ls", "paseo-cafe", "--json"], 30_000))
            .stdout
        )
        const revision = plugin?.installation?.currentRevision
        return (
          plugin?.status === "running" &&
          revision !== undefined &&
          revision !== PREVIOUS_VERSION
        )
      },
      120_000
    )

    const [updated] = parsePluginList(
      (await execPaseo(["plugin", "ls", "paseo-cafe", "--json"], 30_000)).stdout
    )
    assert(updated)
    for (const relativePath of SOURCE_FILES) {
      await cp(
        join(pluginRoot, relativePath),
        join(updated.path, relativePath),
        {
          force: true,
        }
      )
    }
    await execPaseo(["plugin", "reload", "paseo-cafe", "--json"], 60_000)

    const reloaded = (await client.invokePluginRpc(
      "paseo-cafe",
      "directory.list",
      { registryUrl, force: true }
    )) as { registryName?: string; installations?: Array<{ id: string }> }
    assert.equal(reloaded.registryName, "CI registry")
    assert(reloaded.installations?.some((plugin) => plugin.id === "paseo-cafe"))
    console.log(
      JSON.stringify({
        handoffAcknowledged: true,
        from: PREVIOUS_VERSION,
        to: updated.installation?.currentRevision,
        reloadedRpc: true,
      })
    )
  } catch (error) {
    if (daemonOutput) console.error(daemonOutput)
    throw error
  } finally {
    await client?.close().catch(() => undefined)
    if (daemon && daemon.exitCode === null) {
      await execPaseo(
        ["daemon", "stop", "--force", "--timeout", "5", "--json"],
        15_000
      ).catch(() => undefined)
      if (daemon.exitCode === null) daemon.kill("SIGTERM")
      await Promise.race([once(daemon, "exit"), delay(5_000)]).catch(
        () => undefined
      )
    }
    if (registryServer.listening) {
      const closed = once(registryServer, "close")
      registryServer.close()
      await closed
    }
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    await rm(home, { recursive: true, force: true })
  }
}

await main()
