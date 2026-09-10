import { DurableObject } from "cloudflare:workers"
import { CATALOG_IDS } from "./catalog.generated"
import { type DailyLimits, dailyLimits, type LimitEnv } from "./config"
import { normalizeLifecycleEvent } from "./install"

const DEDUP_RETENTION_MS = 48 * 60 * 60 * 1_000
const MIN_ALARM_DELAY_MS = 60_000

type RecordResult = "accepted" | "duplicate" | "quota"

export interface CountSnapshot {
  schemaVersion: 2
  asOf: string | null
  trackingSince: string | null
  counts: Record<string, number>
  updates: Record<string, number>
  uninstalls: Record<string, number>
}

type CountRow = {
  plugin_id: string
  event_type: "install" | "update" | "uninstall"
  total: number
}

type FoundRow = {
  found: number
}

type NumericRow = {
  value: number | null
}

type TextRow = {
  value: string
}

export class InstallCounter extends DurableObject<LimitEnv> {
  private readonly limits: DailyLimits

  constructor(ctx: DurableObjectState, env: LimitEnv) {
    super(ctx, env)
    this.limits = dailyLimits(env)

    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS accepted_nonces (
          nonce TEXT PRIMARY KEY,
          accepted_at_ms INTEGER NOT NULL
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS accepted_nonces_by_time
          ON accepted_nonces (accepted_at_ms);
        CREATE TABLE IF NOT EXISTS service_metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;
      `)
      const columns = this.ctx.storage.sql
        .exec<{ name: string }>("PRAGMA table_info(daily_counts)")
        .toArray()
      if (columns.length === 0) {
        this.createLifecycleCountsTable()
      } else if (!columns.some(({ name }) => name === "event_type")) {
        this.ctx.storage.sql.exec(
          "ALTER TABLE daily_counts RENAME TO legacy_daily_counts"
        )
        this.createLifecycleCountsTable()
        this.ctx.storage.sql.exec(`
          INSERT INTO daily_counts (day, plugin_id, event_type, count)
          SELECT day, plugin_id, 'install', count FROM legacy_daily_counts;
          DROP TABLE legacy_daily_counts;
        `)
      }
      this.ctx.storage.sql.exec(
        `INSERT INTO service_metadata (key, value) VALUES ('schema_version', '2')
         ON CONFLICT (key) DO UPDATE SET value = excluded.value`
      )
    })
  }

  private createLifecycleCountsTable(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE daily_counts (
        day TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('install', 'update', 'uninstall')),
        count INTEGER NOT NULL CHECK (count >= 0),
        PRIMARY KEY (day, plugin_id, event_type)
      ) WITHOUT ROWID;
    `)
  }

  async record(
    reportValue: unknown,
    nowMs = Date.now()
  ): Promise<RecordResult> {
    const report = normalizeLifecycleEvent(reportValue)
    if (!report || !Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new Error("Invalid install report")
    }

    const day = new Date(nowMs).toISOString().slice(0, 10)
    const result = this.ctx.storage.transactionSync(() => {
      const existing = this.ctx.storage.sql
        .exec<FoundRow>(
          "SELECT 1 AS found FROM accepted_nonces WHERE nonce = ? LIMIT 1",
          report.nonce
        )
        .next()
      if (!existing.done) return "duplicate" as const

      const pluginCount =
        this.ctx.storage.sql
          .exec<NumericRow>(
            `SELECT COALESCE(SUM(count), 0) AS value
             FROM daily_counts WHERE day = ? AND plugin_id = ?`,
            day,
            report.pluginId
          )
          .one().value ?? 0
      const globalCount =
        this.ctx.storage.sql
          .exec<NumericRow>(
            "SELECT COALESCE(SUM(count), 0) AS value FROM daily_counts WHERE day = ?",
            day
          )
          .one().value ?? 0

      if (
        pluginCount >= this.limits.perPlugin ||
        globalCount >= this.limits.global
      ) {
        return "quota" as const
      }

      this.ctx.storage.sql.exec(
        "INSERT INTO accepted_nonces (nonce, accepted_at_ms) VALUES (?, ?)",
        report.nonce,
        nowMs
      )
      this.ctx.storage.sql.exec(
        `INSERT INTO daily_counts (day, plugin_id, event_type, count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT (day, plugin_id, event_type) DO UPDATE
         SET count = daily_counts.count + 1`,
        day,
        report.pluginId,
        report.event
      )
      this.ctx.storage.sql.exec(
        `INSERT INTO service_metadata (key, value) VALUES ('tracking_since', ?)
         ON CONFLICT (key) DO UPDATE
         SET value = MIN(service_metadata.value, excluded.value)`,
        `${day}T00:00:00.000Z`
      )
      return "accepted" as const
    })

    if (result !== "quota") await this.scheduleCleanupAlarm()
    return result
  }

  snapshot(nowMs = Date.now()): CountSnapshot {
    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      throw new Error("Invalid snapshot time")
    }

    const trackingRow = this.ctx.storage.sql
      .exec<TextRow>(
        "SELECT value FROM service_metadata WHERE key = 'tracking_since'"
      )
      .next()
    const trackingSince = trackingRow.done ? undefined : trackingRow.value.value

    if (!trackingSince) {
      return {
        schemaVersion: 2,
        asOf: null,
        trackingSince: null,
        counts: {},
        updates: {},
        uninstalls: {},
      }
    }

    const cutoffDay = new Date(nowMs).toISOString().slice(0, 10)
    const cutoff = `${cutoffDay}T00:00:00.000Z`
    if (trackingSince >= cutoff) {
      return {
        schemaVersion: 2,
        asOf: null,
        trackingSince: null,
        counts: {},
        updates: {},
        uninstalls: {},
      }
    }

    const counts: Record<string, number> = {}
    const updates: Record<string, number> = {}
    const uninstalls: Record<string, number> = {}
    for (const pluginId of CATALOG_IDS) {
      counts[pluginId] = 0
      updates[pluginId] = 0
      uninstalls[pluginId] = 0
    }

    const rows = this.ctx.storage.sql
      .exec<CountRow>(
        `SELECT plugin_id, event_type, SUM(count) AS total
         FROM daily_counts
         WHERE day < ?
         GROUP BY plugin_id, event_type`,
        cutoffDay
      )
      .toArray()
    for (const row of rows) {
      const target =
        row.event_type === "install"
          ? counts
          : row.event_type === "update"
            ? updates
            : uninstalls
      if (Object.hasOwn(target, row.plugin_id))
        target[row.plugin_id] = row.total
    }

    return {
      schemaVersion: 2,
      asOf: cutoff,
      trackingSince,
      counts,
      updates,
      uninstalls,
    }
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (request.method === "POST" && url.pathname === "/events") {
        const report: unknown = await request.json()
        const result = await this.record(report)
        return new Response(null, { status: result === "quota" ? 429 : 204 })
      }

      if (request.method === "GET" && url.pathname === "/counts") {
        return Response.json(this.snapshot())
      }

      return new Response("Not Found", { status: 404 })
    } catch {
      return new Response("Service Unavailable", { status: 503 })
    }
  }

  async alarm(): Promise<void> {
    const nowMs = Date.now()
    const nextAcceptedAt = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "DELETE FROM accepted_nonces WHERE accepted_at_ms <= ?",
        nowMs - DEDUP_RETENTION_MS
      )
      return (
        this.ctx.storage.sql
          .exec<NumericRow>(
            "SELECT MIN(accepted_at_ms) AS value FROM accepted_nonces"
          )
          .one().value ?? null
      )
    })

    if (nextAcceptedAt !== null) {
      await this.ctx.storage.setAlarm(
        Math.max(
          nowMs + MIN_ALARM_DELAY_MS,
          nextAcceptedAt + DEDUP_RETENTION_MS
        )
      )
    }
  }

  private async scheduleCleanupAlarm(): Promise<void> {
    const earliestAcceptedAt =
      this.ctx.storage.sql
        .exec<NumericRow>(
          "SELECT MIN(accepted_at_ms) AS value FROM accepted_nonces"
        )
        .one().value ?? null
    if (earliestAcceptedAt === null) return

    const scheduledAt = Math.max(
      Date.now() + 1_000,
      earliestAcceptedAt + DEDUP_RETENTION_MS
    )
    const currentAlarm = await this.ctx.storage.getAlarm()
    if (currentAlarm === null || scheduledAt < currentAlarm) {
      await this.ctx.storage.setAlarm(scheduledAt)
    }
  }
}
