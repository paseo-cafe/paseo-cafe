import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.jsonc",
        environment: "development",
      },
      miniflare: {
        bindings: {
          REPORTING_ENABLED: "true",
          GLOBAL_DAILY_LIMIT: "3",
          PLUGIN_DAILY_LIMIT: "2",
        },
      },
    }),
  ],
})
