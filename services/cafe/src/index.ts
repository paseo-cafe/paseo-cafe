import { reportingEnabled } from "./config"
import type { CafeEnv } from "./env"
import { parseLifecycleEventRequest } from "./install"
import { InstallCounter } from "./install-counter"

export { InstallCounter }

const COUNTER_NAME = "global"
const NO_STORE_HEADERS = { "cache-control": "no-store" }
const BODY_BY_STATUS: Record<number, string> = {
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  413: "Payload Too Large",
  429: "Too Many Requests",
  503: "Service Unavailable",
}
const pendingCountsByOrigin = new Map<string, Promise<Response>>()

function serviceResponse(status: 400 | 404 | 405 | 413 | 429 | 503): Response {
  return new Response(BODY_BY_STATUS[status], {
    status,
    headers: NO_STORE_HEADERS,
  })
}

export function eventRateLimitKey(request: Request): string {
  const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown"
  return `events:${clientIp}`
}

async function ingestLifecycleEvent(
  request: Request,
  env: CafeEnv
): Promise<Response> {
  if (!reportingEnabled(env.REPORTING_ENABLED)) return serviceResponse(503)

  try {
    const { success } = await env.INSTALL_RATE_LIMITER.limit({
      key: eventRateLimitKey(request),
    })
    if (!success) return serviceResponse(429)
  } catch {
    return serviceResponse(503)
  }
  const parsed = await parseLifecycleEventRequest(request)
  if (!parsed.ok) return serviceResponse(parsed.status)

  try {
    const id = env.INSTALL_COUNTER.idFromName(COUNTER_NAME)
    const response = await env.INSTALL_COUNTER.get(id).fetch(
      new Request("https://install-counter/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.report),
      })
    )

    if (response.status === 204) return new Response(null, { status: 204 })
    if (response.status === 429) return serviceResponse(429)
    return serviceResponse(503)
  } catch {
    return serviceResponse(503)
  }
}

async function loadCounts(env: CafeEnv, cacheKey: Request): Promise<Response> {
  try {
    const id = env.INSTALL_COUNTER.idFromName(COUNTER_NAME)
    const response = await env.INSTALL_COUNTER.get(id).fetch(
      "https://install-counter/counts"
    )
    if (response.status !== 200) return serviceResponse(503)

    const publicResponse = new Response(response.body, {
      status: 200,
      headers: {
        "cache-control": "public, max-age=300",
        "content-type": "application/json; charset=UTF-8",
      },
    })
    try {
      await caches.default.put(cacheKey, publicResponse.clone())
    } catch {
      // A cache outage must not turn an available public snapshot into a 503.
    }
    return publicResponse
  } catch {
    return serviceResponse(503)
  }
}

async function counts(request: Request, env: CafeEnv): Promise<Response> {
  const requestUrl = new URL(request.url)
  const canonicalUrl = `${requestUrl.origin}/v1/counts`
  const cacheKey = new Request(canonicalUrl)
  try {
    const cached = await caches.default.match(cacheKey)
    if (cached) return cached
  } catch {
    // Continue to the Durable Object when an edge cache is unavailable.
  }

  let pending = pendingCountsByOrigin.get(canonicalUrl)
  if (!pending) {
    pending = loadCounts(env, cacheKey)
    pendingCountsByOrigin.set(canonicalUrl, pending)
  }
  try {
    return (await pending).clone()
  } finally {
    if (pendingCountsByOrigin.get(canonicalUrl) === pending) {
      pendingCountsByOrigin.delete(canonicalUrl)
    }
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const pathname = new URL(request.url).pathname

    if (pathname === "/health") {
      if (request.method !== "GET") {
        const response = serviceResponse(405)
        response.headers.set("allow", "GET")
        return response
      }
      return Response.json(
        { status: "ok" },
        { headers: { "cache-control": "no-store" } }
      )
    }

    if (pathname === "/v1/events") {
      if (request.method !== "POST") {
        const response = serviceResponse(405)
        response.headers.set("allow", "POST")
        return response
      }
      return ingestLifecycleEvent(request, env)
    }

    if (pathname === "/v1/counts") {
      if (request.method !== "GET") {
        const response = serviceResponse(405)
        response.headers.set("allow", "GET")
        return response
      }
      return counts(request, env)
    }

    return serviceResponse(404)
  },
} satisfies ExportedHandler<CafeEnv>
