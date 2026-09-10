import { CATALOG_ID_SET } from "./catalog.generated"

export const MAX_EVENT_BODY_BYTES = 512
export const MAX_EVENT_BODY_READ_MS = 5_000

export const LIFECYCLE_EVENTS = ["install", "update", "uninstall"] as const
export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number]

export interface LifecycleEventReport {
  pluginId: string
  event: LifecycleEvent
  nonce: string
}

type ParseResult =
  | { ok: true; report: LifecycleEventReport }
  | { ok: false; status: 400 | 413 }

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function readBoundedBody(
  request: Request
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: 400 | 413 }> {
  const reader = request.body?.getReader()
  if (!reader) return { ok: true, bytes: new Uint8Array() }

  const bytes = new Uint8Array(MAX_EVENT_BODY_BYTES)
  let length = 0
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    void reader.cancel().catch(() => {})
  }, MAX_EVENT_BODY_READ_MS)
  try {
    while (true) {
      const chunk = await reader.read()
      if (timedOut) return { ok: false, status: 400 }
      if (chunk.done) return { ok: true, bytes: bytes.subarray(0, length) }
      if (length + chunk.value.byteLength > MAX_EVENT_BODY_BYTES) {
        void reader.cancel().catch(() => {})
        return { ok: false, status: 413 }
      }
      bytes.set(chunk.value, length)
      length += chunk.value.byteLength
    }
  } catch {
    return { ok: false, status: 400 }
  } finally {
    clearTimeout(timeout)
    reader.releaseLock()
  }
}

export function normalizeLifecycleEvent(
  value: unknown
): LifecycleEventReport | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const keys = Object.keys(value)
  if (
    keys.length !== 3 ||
    !Object.hasOwn(value, "pluginId") ||
    !Object.hasOwn(value, "event") ||
    !Object.hasOwn(value, "nonce")
  ) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.pluginId !== "string" ||
    CATALOG_ID_SET[candidate.pluginId] !== true ||
    typeof candidate.event !== "string" ||
    !LIFECYCLE_EVENTS.includes(candidate.event as LifecycleEvent) ||
    typeof candidate.nonce !== "string" ||
    !UUID_PATTERN.test(candidate.nonce)
  ) {
    return null
  }

  return {
    pluginId: candidate.pluginId,
    event: candidate.event as LifecycleEvent,
    nonce: candidate.nonce.toLowerCase(),
  }
}

export async function parseLifecycleEventRequest(
  request: Request
): Promise<ParseResult> {
  const contentType = request.headers.get("content-type")
  if (
    contentType === null ||
    contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json"
  ) {
    return { ok: false, status: 400 }
  }

  const declaredLength = request.headers.get("content-length")
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return { ok: false, status: 400 }
    if (Number(declaredLength) > MAX_EVENT_BODY_BYTES) {
      return { ok: false, status: 413 }
    }
  }

  const body = await readBoundedBody(request)
  if (!body.ok) return { ok: false, status: body.status }

  let value: unknown
  try {
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(body.bytes)
    value = JSON.parse(text)
  } catch {
    return { ok: false, status: 400 }
  }

  const report = normalizeLifecycleEvent(value)
  if (!report) return { ok: false, status: 400 }

  return { ok: true, report }
}
