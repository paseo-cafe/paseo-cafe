export interface LimitEnv {
  GLOBAL_DAILY_LIMIT?: string
  PLUGIN_DAILY_LIMIT?: string
}

export interface DailyLimits {
  global: number
  perPlugin: number
}

const DEFAULT_GLOBAL_DAILY_LIMIT = 10_000
const DEFAULT_PLUGIN_DAILY_LIMIT = 1_000
const MAX_DAILY_LIMIT = 1_000_000

function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number
): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return fallback

  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= maximum ? parsed : fallback
}

export function reportingEnabled(value: string | undefined): boolean {
  return value === "true"
}

export function dailyLimits(env: LimitEnv): DailyLimits {
  const global = positiveInteger(
    env.GLOBAL_DAILY_LIMIT,
    DEFAULT_GLOBAL_DAILY_LIMIT,
    MAX_DAILY_LIMIT
  )
  const configuredPerPlugin = positiveInteger(
    env.PLUGIN_DAILY_LIMIT,
    DEFAULT_PLUGIN_DAILY_LIMIT,
    MAX_DAILY_LIMIT
  )

  return {
    global,
    perPlugin: Math.min(configuredPerPlugin, global),
  }
}
