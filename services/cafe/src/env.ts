import type { InstallCounter } from "./install-counter"

export interface CafeEnv {
  INSTALL_COUNTER: DurableObjectNamespace<InstallCounter>
  REPORTING_ENABLED?: string
  GLOBAL_DAILY_LIMIT?: string
  PLUGIN_DAILY_LIMIT?: string
  INSTALL_RATE_LIMITER: RateLimit
}
