import {
  evictDurableObject,
  listDurableObjectIds,
  reset,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test"
import { env, exports } from "cloudflare:workers"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CATALOG_IDS } from "../src/catalog.generated"
import type { CafeEnv } from "../src/env"
import worker, { eventRateLimitKey } from "../src/index"
import {
  MAX_EVENT_BODY_READ_MS,
  parseLifecycleEventRequest,
} from "../src/install"
import type { InstallCounter } from "../src/install-counter"

const SERVICE_URL = "https://api.paseo.cafe"
const STAGING_URL = "https://staging-api.paseo.cafe"
const COUNTER_NAME = "global"
const COUNTS_CACHE_KEY = new Request(`${SERVICE_URL}/v1/counts`)
const STAGING_COUNTS_CACHE_KEY = new Request(`${STAGING_URL}/v1/counts`)

function lifecycleRequest(
  pluginId: string,
  nonce = crypto.randomUUID(),
  event: "install" | "update" | "uninstall" = "install"
): Promise<Response> {
  return exports.default.fetch(`${SERVICE_URL}/v1/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pluginId, event, nonce }),
  })
}

function counterStub() {
  return env.INSTALL_COUNTER.get(env.INSTALL_COUNTER.idFromName(COUNTER_NAME))
}

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all([
    reset(),
    caches.default.delete(COUNTS_CACHE_KEY),
    caches.default.delete(STAGING_COUNTS_CACHE_KEY),
  ])
})

describe("Cafe service", () => {
  it("serves health without exposing request data", async () => {
    const response = await exports.default.fetch(`${SERVICE_URL}/health`)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({ status: "ok" })
  })

  it("isolates edge rate limits by the trusted client address", () => {
    expect(
      eventRateLimitKey(
        new Request(`${SERVICE_URL}/v1/events`, {
          headers: { "cf-connecting-ip": "203.0.113.7" },
        })
      )
    ).toBe("events:203.0.113.7")
    expect(eventRateLimitKey(new Request(`${SERVICE_URL}/v1/events`))).toBe(
      "events:unknown"
    )
  })

  it("rejects reporting while disabled without creating counter storage", async () => {
    const response = await worker.fetch(
      new Request(`${SERVICE_URL}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pluginId: CATALOG_IDS[0],
          event: "install",
          nonce: crypto.randomUUID(),
        }),
      }),
      { REPORTING_ENABLED: "false" } as CafeEnv
    )

    expect(response.status).toBe(503)
    expect(await listDurableObjectIds(env.INSTALL_COUNTER)).toEqual([])
  })

  it("rejects unknown routes and methods before creating counter storage", async () => {
    const responses = await Promise.all([
      exports.default.fetch(`${SERVICE_URL}/v1/events`),
      exports.default.fetch(`${SERVICE_URL}/v1/counts`, { method: "POST" }),
      exports.default.fetch(`${SERVICE_URL}/unknown`),
    ])

    expect(responses.map((response) => response.status)).toEqual([
      405, 405, 404,
    ])
    expect(await listDurableObjectIds(env.INSTALL_COUNTER)).toEqual([])
  })

  it("rejects unlisted IDs, extra fields, malformed UUIDs, and non-JSON", async () => {
    const cases = [
      {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pluginId: "not-in-the-catalog",
          event: "install",
          nonce: crypto.randomUUID(),
        }),
      },
      {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pluginId: CATALOG_IDS[0],
          nonce: crypto.randomUUID(),
          event: "install",
          metadata: "not accepted",
        }),
      },
      {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pluginId: CATALOG_IDS[0],
          event: "install",
          nonce: "not-a-uuid",
        }),
      },
      {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pluginId: CATALOG_IDS[0],
          event: "activate",
          nonce: crypto.randomUUID(),
        }),
      },
      {
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({
          pluginId: CATALOG_IDS[0],
          event: "install",
          nonce: crypto.randomUUID(),
        }),
      },
    ]

    for (const request of cases) {
      const response = await exports.default.fetch(`${SERVICE_URL}/v1/events`, {
        method: "POST",
        ...request,
      })
      expect(response.status).toBe(400)
    }
  })

  it("enforces the streamed byte limit even when content-length is absent or lies", async () => {
    const oversized = `${JSON.stringify({
      pluginId: CATALOG_IDS[0],
      event: "install",
      nonce: crypto.randomUUID(),
    })}${" ".repeat(513)}`
    for (const contentLength of [undefined, "1"]) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(oversized))
          controller.close()
        },
      })
      const headers = new Headers({ "content-type": "application/json" })
      if (contentLength) headers.set("content-length", contentLength)

      const response = await exports.default.fetch(
        new Request(`${SERVICE_URL}/v1/events`, {
          method: "POST",
          headers,
          body: stream,
        })
      )

      expect(response.status).toBe(413)
    }
  })

  it("bounds stalled bodies even when cancellation never resolves", async () => {
    vi.useFakeTimers()
    const body = new ReadableStream<Uint8Array>({
      cancel: () => new Promise<void>(() => {}),
    })
    const result = parseLifecycleEventRequest(
      new Request(`${SERVICE_URL}/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
    )
    await vi.advanceTimersByTimeAsync(MAX_EVENT_BODY_READ_MS)
    expect(await result).toEqual({ ok: false, status: 400 })
  })

  it("deduplicates atomically and preserves the result across eviction", async () => {
    const nonce = crypto.randomUUID()
    const concurrent = await Promise.all([
      lifecycleRequest(CATALOG_IDS[0], nonce),
      lifecycleRequest(CATALOG_IDS[0], nonce),
    ])
    expect(concurrent.map((response) => response.status)).toEqual([204, 204])

    const stub = counterStub()
    await evictDurableObject(stub)
    expect((await lifecycleRequest(CATALOG_IDS[0], nonce)).status).toBe(204)

    const storedCount = await runInDurableObject(
      stub,
      (_instance: InstallCounter, state) =>
        state.storage.sql
          .exec<{ value: number }>(
            "SELECT COALESCE(SUM(count), 0) AS value FROM daily_counts"
          )
          .one().value
    )
    expect(storedCount).toBe(1)
  })

  it("enforces persistent per-plugin and global daily caps across eviction without storing denials", async () => {
    const beforeEviction = await Promise.all([
      lifecycleRequest(CATALOG_IDS[0]),
      lifecycleRequest(CATALOG_IDS[0]),
    ])
    await evictDurableObject(counterStub())
    const afterEviction = await Promise.all([
      lifecycleRequest(CATALOG_IDS[0]),
      lifecycleRequest(CATALOG_IDS[1]),
      lifecycleRequest(CATALOG_IDS[1]),
    ])
    const statuses = [...beforeEviction, ...afterEviction].map(
      (response) => response.status
    )
    expect(statuses.filter((status) => status === 204)).toHaveLength(3)
    expect(statuses.filter((status) => status === 429)).toHaveLength(2)

    const stored = await runInDurableObject(
      counterStub(),
      (_instance: InstallCounter, state) => ({
        reports: state.storage.sql
          .exec<{ value: number }>(
            "SELECT COUNT(*) AS value FROM accepted_nonces"
          )
          .one().value,
        installs: state.storage.sql
          .exec<{ value: number }>(
            "SELECT COALESCE(SUM(count), 0) AS value FROM daily_counts"
          )
          .one().value,
      })
    )
    expect(stored).toEqual({ reports: 3, installs: 3 })
  })

  it("migrates existing install totals into the lifecycle schema", async () => {
    const stub = counterStub()
    await runInDurableObject(stub, (_instance: InstallCounter, state) => {
      state.storage.sql.exec(`
        DROP TABLE daily_counts;
        CREATE TABLE daily_counts (
          day TEXT NOT NULL,
          plugin_id TEXT NOT NULL,
          count INTEGER NOT NULL,
          PRIMARY KEY (day, plugin_id)
        ) WITHOUT ROWID;
        INSERT INTO daily_counts (day, plugin_id, count)
        VALUES ('2026-01-01', '${CATALOG_IDS[0]}', 4);
        DELETE FROM service_metadata WHERE key = 'schema_version';
        INSERT INTO service_metadata (key, value)
        VALUES ('tracking_since', '2026-01-01T00:00:00.000Z')
        ON CONFLICT (key) DO UPDATE SET value = excluded.value;
      `)
    })
    await evictDurableObject(stub)

    const response = await exports.default.fetch(`${SERVICE_URL}/v1/counts`)
    const snapshot = (await response.json()) as {
      counts: Record<string, number>
      updates: Record<string, number>
      uninstalls: Record<string, number>
    }
    expect(snapshot.counts[CATALOG_IDS[0]]).toBe(4)
    expect(snapshot.updates[CATALOG_IDS[0]]).toBe(0)
    expect(snapshot.uninstalls[CATALOG_IDS[0]]).toBe(0)
    const columns = await runInDurableObject(
      stub,
      (_instance: InstallCounter, state) =>
        state.storage.sql
          .exec<{ name: string }>("PRAGMA table_info(daily_counts)")
          .toArray()
          .map(({ name }) => name)
    )
    expect(columns).toContain("event_type")
  })

  it("withholds the current UTC day and publishes complete prior-day counts", async () => {
    expect((await lifecycleRequest(CATALOG_IDS[0])).status).toBe(204)

    const unpublished = (await (
      await exports.default.fetch(`${SERVICE_URL}/v1/counts`)
    ).json()) as {
      asOf: string | null
      trackingSince: string | null
      counts: Record<string, number>
      updates: Record<string, number>
      uninstalls: Record<string, number>
    }
    expect(unpublished.asOf).toBeNull()
    expect(unpublished.trackingSince).toBeNull()
    expect(unpublished.counts).toEqual({})
    expect(unpublished.updates).toEqual({})
    expect(unpublished.uninstalls).toEqual({})

    await reset()
    await caches.default.delete(COUNTS_CACHE_KEY)
    const cutoffDay = new Date().toISOString().slice(0, 10)
    const cutoff = `${cutoffDay}T00:00:00.000Z`
    const priorDayTime = Date.parse(cutoff) - 1_000
    await runInDurableObject(counterStub(), (instance: InstallCounter) =>
      instance.record(
        {
          pluginId: CATALOG_IDS[0],
          event: "install",
          nonce: crypto.randomUUID(),
        },
        priorDayTime
      )
    )
    await runInDurableObject(counterStub(), (instance: InstallCounter) =>
      instance.record(
        {
          pluginId: CATALOG_IDS[0],
          event: "update",
          nonce: crypto.randomUUID(),
        },
        priorDayTime
      )
    )
    await runInDurableObject(counterStub(), (instance: InstallCounter) =>
      instance.record(
        {
          pluginId: CATALOG_IDS[1],
          event: "uninstall",
          nonce: crypto.randomUUID(),
        },
        priorDayTime
      )
    )

    const published = (await (
      await exports.default.fetch(`${SERVICE_URL}/v1/counts`)
    ).json()) as {
      schemaVersion: number
      asOf: string | null
      trackingSince: string | null
      counts: Record<string, number>
      updates: Record<string, number>
      uninstalls: Record<string, number>
    }
    expect(published).toEqual({
      schemaVersion: 2,
      asOf: cutoff,
      trackingSince: `${new Date(priorDayTime).toISOString().slice(0, 10)}T00:00:00.000Z`,
      counts: Object.fromEntries(
        CATALOG_IDS.map((id) => [id, id === CATALOG_IDS[0] ? 1 : 0])
      ),
      updates: Object.fromEntries(
        CATALOG_IDS.map((id) => [id, id === CATALOG_IDS[0] ? 1 : 0])
      ),
      uninstalls: Object.fromEntries(
        CATALOG_IDS.map((id) => [id, id === CATALOG_IDS[1] ? 1 : 0])
      ),
    })
  })

  it("strips query strings from cache keys while isolating request origins", async () => {
    const cutoffDay = new Date().toISOString().slice(0, 10)
    const priorDayTime = Date.parse(`${cutoffDay}T00:00:00.000Z`) - 1_000
    const stub = counterStub()
    await runInDurableObject(stub, (instance: InstallCounter) =>
      instance.record(
        {
          pluginId: CATALOG_IDS[0],
          event: "install",
          nonce: crypto.randomUUID(),
        },
        priorDayTime
      )
    )

    const first = await (
      await exports.default.fetch(`${SERVICE_URL}/v1/counts`)
    ).text()
    await runInDurableObject(stub, (instance: InstallCounter) =>
      instance.record(
        {
          pluginId: CATALOG_IDS[0],
          event: "install",
          nonce: crypto.randomUUID(),
        },
        priorDayTime + 1
      )
    )
    const cached = await (
      await exports.default.fetch(`${SERVICE_URL}/v1/counts?ignored=1`)
    ).text()
    const staging = (await (
      await exports.default.fetch(`${STAGING_URL}/v1/counts?ignored=1`)
    ).json()) as { counts: Record<string, number> }

    expect(cached).toBe(first)
    expect(JSON.parse(cached).counts[CATALOG_IDS[0]]).toBe(1)
    expect(staging.counts[CATALOG_IDS[0]]).toBe(2)
  })

  it("expires nonce replay state by alarm while retaining aggregates", async () => {
    const expiredAt = Date.now() - 49 * 60 * 60 * 1_000
    const stub = counterStub()
    await runInDurableObject(stub, (instance: InstallCounter) =>
      instance.record(
        {
          pluginId: CATALOG_IDS[0],
          event: "install",
          nonce: crypto.randomUUID(),
        },
        expiredAt
      )
    )

    expect(await runDurableObjectAlarm(stub)).toBe(true)
    const stored = await runInDurableObject(
      stub,
      (_instance: InstallCounter, state) => ({
        nonces: state.storage.sql
          .exec<{ value: number }>(
            "SELECT COUNT(*) AS value FROM accepted_nonces"
          )
          .one().value,
        installs: state.storage.sql
          .exec<{ value: number }>(
            "SELECT COALESCE(SUM(count), 0) AS value FROM daily_counts"
          )
          .one().value,
      })
    )
    expect(stored).toEqual({ nonces: 0, installs: 1 })
  })
})
