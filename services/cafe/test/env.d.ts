import type { CafeEnv } from "../src/env"
import type * as MainModule from "../src/index"

declare global {
  namespace Cloudflare {
    interface Env extends CafeEnv {}

    interface GlobalProps {
      mainModule: typeof MainModule
      durableNamespaces: "InstallCounter"
    }
  }
}
