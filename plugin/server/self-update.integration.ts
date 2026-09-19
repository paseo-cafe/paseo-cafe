import assert from "node:assert/strict"
import { type ChildProcess, execFile, spawn } from "node:child_process"
import { once } from "node:events"
import { chmod, cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { DaemonClient } from "../node_modules/@getpaseo/client/dist/daemon-client.js"
import {
  getSelfUpdateRecoveryState,
  type InstalledPlugin,
  type PendingSelfUpdate,
} from "../shared/directory"
import { execPaseo } from "./directory"

const execFileAsync = promisify(execFile)
const PREVIOUS_VERSION = "0.5.0"
const TARGET_VERSION = "0.6.0"
const TARGET_INTEGRITY =
  "sha512-l+AGCB6NOLsIvTDJ97aAWWQcDZ4f7rL2cH5GnpX1cevy8iOC7ueo94xehG9JZX0xc7wzZuzaZ/R2IghkbmDc5w=="

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

async function main(): Promise<void> {
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  const home = await mkdtemp(join(tmpdir(), "paseo cafe ci self update-"))
  const binDir = join(home, "bin")
  const originalPath = process.env.PATH
  const originalDirectoryUrl = process.env.PASEO_CAFE_DIRECTORY_URL
  let daemon: ChildProcess | undefined
  let client: DaemonClient | undefined
  let daemonOutput = ""

  const catalog = {
    generatedAt: "2026-09-19T00:00:00.000Z",
    plugins: [
      {
        id: "paseo-cafe",
        repo: "paseo-cafe/paseo-cafe",
        path: "plugin",
        package: "paseo-cafe",
        url: "https://github.com/paseo-cafe/paseo-cafe",
        name: "Paseo Cafe",
        description: "Self-update integration fixture",
        categories: ["productivity"],
        platforms: [],
        caveats: [],
        version: TARGET_VERSION,
        npm: {
          package: "paseo-cafe",
          version: TARGET_VERSION,
          integrity: TARGET_INTEGRITY,
        },
        npmSecurity: {
          status: "passed",
          blockingFindings: 0,
          advisoryFindings: 0,
          version: TARGET_VERSION,
          integrity: TARGET_INTEGRITY,
        },
      },
    ],
  }
  const catalogServer = createServer((request, response) => {
    if (request.url !== "/api/plugins") {
      response.writeHead(404).end()
      return
    }
    response.setHeader("content-type", "application/json")
    response.end(JSON.stringify(catalog))
  })

  try {
    await mkdir(binDir)
    catalogServer.listen(0, "127.0.0.1")
    await once(catalogServer, "listening")
    const address = catalogServer.address()
    assert(address && typeof address !== "string")
    const catalogUrl = `http://127.0.0.1:${address.port}/api/plugins`
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
    process.env.PASEO_CAFE_DIRECTORY_URL = catalogUrl

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

    const installed = await execPaseo(
      ["plugin", "add", `npm:paseo-cafe@${PREVIOUS_VERSION}`, "--json"],
      120_000
    )
    const previous = JSON.parse(installed.stdout) as PluginListItem
    assert.equal(previous.status, "running")
    assert.equal(previous.installation?.currentRevision, PREVIOUS_VERSION)

    for (const relativePath of [
      "index.server.ts",
      "server/directory.ts",
      "shared/catalog.ts",
      "shared/directory.ts",
      "shared/inline-markdown.ts",
    ]) {
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
    const prepared = (await client.invokePluginRpc(
      "paseo-cafe",
      "directory.update",
      {
        entryId: "paseo-cafe",
        installationId: "paseo-cafe",
        channel: "stable",
        expectedRepo: "paseo-cafe/paseo-cafe",
        expectedPath: "plugin",
        expectedPackage: "paseo-cafe",
        expectedVersion: TARGET_VERSION,
        expectedIntegrity: TARGET_INTEGRITY,
      }
    )) as { ok: boolean; selfUpdateToken?: string }
    assert.equal(prepared.ok, true)
    assert.match(prepared.selfUpdateToken ?? "", /^[0-9a-f]{64}$/)
    const pendingSelfUpdate: PendingSelfUpdate = {
      installationId: "paseo-cafe",
      source: "npm",
      targetRevision: TARGET_VERSION,
      requestedAt: new Date().toISOString(),
    }
    const settingsBefore = (await client.invokePluginRpc(
      "paseo-cafe",
      "settings.directory-settings.read",
      {}
    )) as {
      status: "ready"
      revision: string
      values: Record<string, unknown>
    }
    assert.equal(settingsBefore.status, "ready")
    const savedEvidence = (await client.invokePluginRpc(
      "paseo-cafe",
      "settings.directory-settings.write",
      {
        revision: settingsBefore.revision,
        values: { ...settingsBefore.values, pendingSelfUpdate },
      }
    )) as { status: string }
    assert.equal(savedEvidence.status, "saved")

    const beforeApply = parsePluginList(
      (await execPaseo(["plugin", "ls", "paseo-cafe", "--json"], 30_000)).stdout
    )[0]
    assert.equal(beforeApply?.status, "running")
    assert.equal(beforeApply?.installation?.currentRevision, PREVIOUS_VERSION)

    const applied = await client.invokePluginRpc(
      "paseo-cafe",
      "directory.apply-self-update",
      { token: prepared.selfUpdateToken }
    )
    assert.deepEqual(applied, { accepted: true })

    await waitFor(
      "updated plugin to load",
      async () => {
        const [plugin] = parsePluginList(
          (await execPaseo(["plugin", "ls", "paseo-cafe", "--json"], 30_000))
            .stdout
        )
        return (
          plugin?.status === "running" &&
          plugin.installation?.currentRevision === TARGET_VERSION
        )
      },
      120_000
    )

    const [updated] = parsePluginList(
      (await execPaseo(["plugin", "ls", "paseo-cafe", "--json"], 30_000)).stdout
    )
    assert(updated)
    for (const relativePath of [
      "index.server.ts",
      "server/directory.ts",
      "shared/catalog.ts",
      "shared/directory.ts",
      "shared/inline-markdown.ts",
    ]) {
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
      { baseUrl: catalogUrl, force: true }
    )) as {
      plugins?: Array<{ id?: string }>
      installations?: InstalledPlugin[]
    }
    assert(reloaded.plugins?.some((plugin) => plugin.id === "paseo-cafe"))
    assert.equal(
      getSelfUpdateRecoveryState(
        pendingSelfUpdate,
        reloaded.installations ?? []
      ),
      "succeeded"
    )
    const settingsAfter = (await client.invokePluginRpc(
      "paseo-cafe",
      "settings.directory-settings.read",
      {}
    )) as {
      status: "ready"
      revision: string
      values: Record<string, unknown> & {
        pendingSelfUpdate?: PendingSelfUpdate | null
      }
    }
    assert.deepEqual(settingsAfter.values.pendingSelfUpdate, pendingSelfUpdate)
    const clearedEvidence = (await client.invokePluginRpc(
      "paseo-cafe",
      "settings.directory-settings.write",
      {
        revision: settingsAfter.revision,
        values: { ...settingsAfter.values, pendingSelfUpdate: null },
      }
    )) as { status: string }
    assert.equal(clearedEvidence.status, "saved")
    const cleared = (await client.invokePluginRpc(
      "paseo-cafe",
      "settings.directory-settings.read",
      {}
    )) as { status: "ready"; values: { pendingSelfUpdate?: unknown } }
    assert.equal(cleared.status, "ready")
    assert.equal(cleared.values.pendingSelfUpdate, null)
    console.log(
      JSON.stringify({
        prepared: true,
        applyAcknowledged: true,
        from: PREVIOUS_VERSION,
        to: TARGET_VERSION,
        reloadedRpc: true,
        evidenceRecovered: true,
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
    if (catalogServer.listening) {
      const closed = once(catalogServer, "close")
      catalogServer.close()
      await closed
    }
    if (originalPath === undefined) delete process.env.PATH
    else process.env.PATH = originalPath
    if (originalDirectoryUrl === undefined)
      delete process.env.PASEO_CAFE_DIRECTORY_URL
    else process.env.PASEO_CAFE_DIRECTORY_URL = originalDirectoryUrl
    await rm(home, { recursive: true, force: true })
  }
}

await main()
