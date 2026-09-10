import { createFileRoute } from "@tanstack/react-router"
import type { PluginRecord } from "@/lib/plugin-schema"
import { listPlugins } from "@/lib/plugins-data"

export const MAX_API_RESPONSE_BYTES = 16 * 1_024 * 1_024
export const MAX_API_README_TEXT_LENGTH = 16_000
const MAX_API_PLUGIN_COUNT = 500
export const MAX_API_PLUGIN_BYTES = 32_000
const utf8Encoder = new TextEncoder()

function boundedString(value: string, maximum: number): string {
  return value.slice(0, maximum)
}

function serializedBytes(value: unknown): number {
  return utf8Encoder.encode(JSON.stringify(value)).byteLength
}

/**
 * Keep the static API to the fields understood by the companion plugin. Each
 * record is capped at 32,000 serialized bytes, so 500 records plus the JSON
 * envelope remain below the consumer's 16 MiB response limit. README source
 * gets an additional explicit character cap before competing for that budget.
 */
export function projectPluginForDirectory(
  plugin: PluginRecord
): Record<string, unknown> {
  const projected: Record<string, unknown> = {
    id: boundedString(plugin.id, 200),
    repo: boundedString(plugin.repo, 200),
    url: boundedString(plugin.url, 2_048),
    name: boundedString(plugin.name, 200),
    description: boundedString(plugin.description, 1_000),
    categories: [],
    platforms: [],
    caveats: [],
    images: [],
    health: plugin.health,
    scannedAt: boundedString(plugin.scannedAt, 100),
  }

  const addIfItFits = (key: string, value: unknown) => {
    if (value === undefined) return
    const previous = projected[key]
    projected[key] = value
    if (serializedBytes(projected) > MAX_API_PLUGIN_BYTES) {
      if (previous === undefined) delete projected[key]
      else projected[key] = previous
    }
  }

  addIfItFits("path", plugin.path && boundedString(plugin.path, 500))
  addIfItFits("author", plugin.author && boundedString(plugin.author, 200))
  addIfItFits("license", plugin.license && boundedString(plugin.license, 100))
  addIfItFits(
    "paseoVersionRequirement",
    plugin.paseoVersionRequirement &&
      boundedString(plugin.paseoVersionRequirement, 200)
  )
  addIfItFits(
    "categories",
    plugin.categories.slice(0, 32).map((value) => boundedString(value, 100))
  )
  addIfItFits(
    "platforms",
    plugin.platforms.slice(0, 32).map((value) => boundedString(value, 100))
  )
  addIfItFits(
    "caveats",
    plugin.caveats.slice(0, 64).map((value) => boundedString(value, 1_000))
  )
  addIfItFits("manifest", plugin.manifest)
  addIfItFits(
    "repoMeta",
    plugin.repoMeta && {
      stars: plugin.repoMeta.stars,
      defaultBranch: boundedString(plugin.repoMeta.defaultBranch, 255),
      pushedAt: boundedString(plugin.repoMeta.pushedAt, 100),
    }
  )
  addIfItFits(
    "owner",
    plugin.owner && {
      login: boundedString(plugin.owner.login, 100),
      avatarUrl: boundedString(plugin.owner.avatarUrl, 2_048),
    }
  )
  addIfItFits("installNotesHtml", plugin.installNotesHtml)
  addIfItFits("limitationsNotesHtml", plugin.limitationsNotesHtml)
  addIfItFits(
    "security",
    plugin.security?.status === "unknown" || !plugin.security
      ? undefined
      : {
          status: plugin.security.status,
          blockingFindings: plugin.security.blockingFindings,
          advisoryFindings: plugin.security.advisoryFindings,
          scannedAt:
            plugin.security.scannedAt &&
            boundedString(plugin.security.scannedAt, 100),
          commit: plugin.security.commit,
          reportUrl:
            plugin.security.reportUrl &&
            boundedString(plugin.security.reportUrl, 2_048),
        }
  )
  addIfItFits(
    "images",
    plugin.images.slice(0, 32).map((value) => boundedString(value, 2_048))
  )
  addIfItFits(
    "scanError",
    plugin.scanError && boundedString(plugin.scanError, 4_000)
  )

  if (plugin.readmeText) {
    let minimum = 0
    let maximum = Math.min(plugin.readmeText.length, MAX_API_README_TEXT_LENGTH)
    while (minimum < maximum) {
      const candidateLength = Math.ceil((minimum + maximum) / 2)
      projected.readmeText = plugin.readmeText.slice(0, candidateLength)
      if (serializedBytes(projected) <= MAX_API_PLUGIN_BYTES) {
        minimum = candidateLength
      } else {
        maximum = candidateLength - 1
      }
    }
    if (minimum > 0) {
      projected.readmeText = plugin.readmeText.slice(0, minimum)
    } else {
      delete projected.readmeText
    }
  }

  return projected
}

/**
 * Public, read-only JSON view of the same directory data the site renders.
 * Nitro evaluates this handler while prerendering and publishes the response
 * as the static /api/plugins asset consumed by the companion Paseo plugin.
 */
export const Route = createFileRoute("/api/plugins")({
  server: {
    handlers: {
      GET: async () => {
        const plugins = listPlugins()
          .slice(0, MAX_API_PLUGIN_COUNT)
          .map(projectPluginForDirectory)
        return Response.json(
          {
            plugins,
            count: plugins.length,
            generatedAt: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "public, max-age=300" } }
        )
      },
    },
  },
})
