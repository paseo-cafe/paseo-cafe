import { randomUUID } from "node:crypto"
import { setTimeout as sleep } from "node:timers/promises"
import { z } from "zod"
import {
  type LifecycleEventType,
  lifecycleEventTypeSchema,
} from "../shared/directory"

export const DEFAULT_INSTALL_REPORT_URL = "https://api.paseo.cafe/v1/events"

const installReportSchema = z
  .object({
    pluginId: z.string().min(1).max(200),
    event: lifecycleEventTypeSchema,
    nonce: z.uuid(),
  })
  .strict()

export type LifecycleEventReport = z.infer<typeof installReportSchema>

const DEFAULT_RETRY_DELAYS_MS = [250, 1_000] as const
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000
const ELIGIBILITY_TTL_MS = 5 * 60 * 1_000

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (normalized === "localhost" || normalized === "::1") return true
  const parts = normalized.split(".")
  return (
    parts.length === 4 &&
    parts[0] === "127" &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  )
}

export function resolveInstallReportUrl(
  override = process.env.PASEO_CAFE_SERVICE_URL
): string {
  if (!override) return DEFAULT_INSTALL_REPORT_URL

  let url: URL
  try {
    url = new URL(override)
  } catch {
    throw new Error("PASEO_CAFE_SERVICE_URL must be an absolute URL")
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "PASEO_CAFE_SERVICE_URL cannot contain credentials, a query, or a fragment"
    )
  }
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopbackHostname(url.hostname))
  ) {
    throw new Error(
      "PASEO_CAFE_SERVICE_URL must use HTTPS, or HTTP on a loopback host"
    )
  }
  if (url.pathname !== "/" && url.pathname !== "/v1/events") {
    throw new Error(
      "PASEO_CAFE_SERVICE_URL must be a service origin or end in /v1/events"
    )
  }
  url.pathname = "/v1/events"
  return url.toString()
}

function abortError(): Error {
  const error = new Error("Install report aborted")
  error.name = "AbortError"
  return error
}

export interface SendInstallReportOptions {
  signal?: AbortSignal
  serviceUrl?: string
  requestTimeoutMs?: number
  retryDelaysMs?: readonly number[]
  fetch?: typeof globalThis.fetch
}

/**
 * Sends one deliberately small report. Retries are bounded in memory and reuse
 * the caller-provided operation nonce; there is no persistent or autonomous
 * retry queue.
 */
export async function sendLifecycleEvent(
  report: LifecycleEventReport,
  options: SendInstallReportOptions = {}
): Promise<void> {
  const payload = installReportSchema.parse(report)
  const url = resolveInstallReportUrl(options.serviceUrl)
  const fetchImpl = options.fetch ?? globalThis.fetch
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS
  const requestTimeout = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

  for (let attempt = 0; ; attempt += 1) {
    if (options.signal?.aborted) throw abortError()
    const controller = new AbortController()
    const relayAbort = () => controller.abort()
    options.signal?.addEventListener("abort", relayAbort, { once: true })
    const timeout = setTimeout(() => controller.abort(), requestTimeout)
    let response: Response | undefined
    try {
      response = await fetchImpl(url, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (error) {
      if (options.signal?.aborted) throw abortError()
      if (attempt >= retryDelays.length) throw error
    } finally {
      clearTimeout(timeout)
      options.signal?.removeEventListener("abort", relayAbort)
    }

    if (response?.status === 204) return
    void response?.body?.cancel().catch(() => {})
    if (response) {
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt >= retryDelays.length) {
        throw new Error(
          `Install report rejected with status ${response.status}`
        )
      }
    }
    await sleep(retryDelays[attempt] ?? 0, undefined, {
      signal: options.signal,
    })
  }
}

interface PendingEligibility {
  pluginId: string
  confirmed: boolean
  completed: boolean
  consent: boolean
  expires: ReturnType<typeof setTimeout>
}

export interface InstallReportManager {
  begin(pluginId: string): string
  confirm(reportToken: string, installed: boolean): void
  complete(reportToken: string, consent: boolean): boolean
  report(
    events: readonly { pluginId: string; event: LifecycleEventType }[]
  ): Promise<number>
  setEnabled(enabled: boolean): void
  dispose(): void
}

export interface InstallReportManagerOptions {
  send?: (
    report: LifecycleEventReport,
    options: { signal: AbortSignal }
  ) => Promise<void>
  nonce?: () => string
}

export function createInstallReportManager(
  options: InstallReportManagerOptions = {}
): InstallReportManager {
  const pending = new Map<string, PendingEligibility>()
  const active = new Map<string, AbortController>()
  const send =
    options.send ??
    ((report, sendOptions) => sendLifecycleEvent(report, sendOptions))
  const nonce = options.nonce ?? randomUUID
  let disposed = false
  let cancellationGeneration = 0
  let reportingEnabled = true

  function removePending(reportToken: string) {
    const eligibility = pending.get(reportToken)
    if (!eligibility) return
    clearTimeout(eligibility.expires)
    pending.delete(reportToken)
  }

  function dispatch(reportToken: string, eligibility: PendingEligibility) {
    if (
      disposed ||
      !reportingEnabled ||
      !eligibility.confirmed ||
      !eligibility.completed ||
      !eligibility.consent
    ) {
      return
    }
    removePending(reportToken)
    const controller = new AbortController()
    active.set(reportToken, controller)
    void send(
      { pluginId: eligibility.pluginId, event: "install", nonce: reportToken },
      { signal: controller.signal }
    )
      .catch(() => {})
      .finally(() => active.delete(reportToken))
  }

  function cancelOutstanding() {
    cancellationGeneration += 1
    for (const reportToken of pending.keys()) removePending(reportToken)
    for (const controller of active.values()) controller.abort()
    active.clear()
  }

  return {
    begin(pluginId) {
      if (disposed || !reportingEnabled) return nonce()
      const reportToken = nonce()
      pending.set(reportToken, {
        pluginId,
        confirmed: false,
        completed: false,
        consent: false,
        expires: setTimeout(
          () => removePending(reportToken),
          ELIGIBILITY_TTL_MS
        ),
      })
      return reportToken
    },
    confirm(reportToken, installed) {
      const eligibility = pending.get(reportToken)
      if (!eligibility) return
      if (!installed) {
        removePending(reportToken)
        return
      }
      eligibility.confirmed = true
      dispatch(reportToken, eligibility)
    },
    complete(reportToken, consent) {
      const eligibility = pending.get(reportToken)
      if (!reportingEnabled || !eligibility || eligibility.completed)
        return false
      eligibility.completed = true
      eligibility.consent = consent
      if (!consent) {
        removePending(reportToken)
        return false
      }
      dispatch(reportToken, eligibility)
      return true
    },
    setEnabled(enabled) {
      reportingEnabled = enabled
      if (!enabled) cancelOutstanding()
    },
    async report(events) {
      if (disposed || !reportingEnabled) return 0
      const generation = cancellationGeneration
      let accepted = 0
      for (const event of events) {
        if (
          disposed ||
          !reportingEnabled ||
          generation !== cancellationGeneration
        )
          break
        const reportToken = nonce()
        const controller = new AbortController()
        active.set(reportToken, controller)
        try {
          await send(
            { ...event, nonce: reportToken },
            { signal: controller.signal }
          )
          if (generation !== cancellationGeneration) break
          accepted += 1
        } catch {
          break
        } finally {
          active.delete(reportToken)
        }
      }
      return accepted
    },
    dispose() {
      disposed = true
      cancelOutstanding()
    },
  }
}
