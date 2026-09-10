import { z } from "zod"
import { isTrustedRemoteImageUrl } from "@/lib/images"
import { type PluginRecord, pluginHealthSchema } from "@/lib/plugin-schema"
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site"

export const MAX_API_RESPONSE_BYTES = 16 * 1_024 * 1_024
export const MAX_API_README_TEXT_LENGTH = 16_000
export const MAX_API_PLUGIN_COUNT = 500
export const MAX_API_PLUGIN_BYTES = 32_000

const utf8Encoder = new TextEncoder()

const httpUrlSchema = z
  .url()
  .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
    message: "Must be an http(s) URL",
  })

const directoryImageUrlSchema = httpUrlSchema
  .max(2_048)
  .refine(isTrustedRemoteImageUrl, "Image URL must use trusted HTTPS hosting")
export const directoryPluginSchema = z.object({
  id: z.string().max(200),
  repo: z.string().max(200),
  path: z.string().max(500).optional(),
  url: httpUrlSchema.max(2_048),
  name: z.string().max(200),
  description: z.string().max(1_000),
  author: z.string().max(200).optional(),
  license: z.string().max(100).optional(),
  paseoVersionRequirement: z.string().max(200).optional(),
  categories: z.array(z.string().max(100)).max(32),
  platforms: z.array(z.string().max(100)).max(32),
  caveats: z.array(z.string().max(1_000)).max(64),
  manifest: z.record(z.string(), z.unknown()).optional(),
  repoMeta: z
    .object({
      stars: z.number().int().nonnegative(),
      defaultBranch: z.string().max(255),
      pushedAt: z.string().max(100),
    })
    .optional(),
  owner: z
    .object({
      login: z.string().max(100),
      avatarUrl: httpUrlSchema.max(2_048),
    })
    .optional(),
  installNotesHtml: z.string().optional(),
  limitationsNotesHtml: z.string().optional(),
  security: z
    .object({
      status: z.enum(["passed", "failed"]),
      blockingFindings: z.number().int().nonnegative(),
      advisoryFindings: z.number().int().nonnegative(),
      scannedAt: z.string().max(100).optional(),
      commit: z
        .string()
        .regex(/^[0-9a-f]{40}$/i)
        .optional(),
      reportUrl: httpUrlSchema.max(2_048).optional(),
    })
    .optional(),
  images: z.array(directoryImageUrlSchema).max(32),
  readmeText: z.string().max(MAX_API_README_TEXT_LENGTH).optional(),
  scanError: z.string().max(4_000).optional(),
  scannedAt: z.string().max(100),
  health: pluginHealthSchema,
})

export const directoryCatalogSchema = z.object({
  plugins: z.array(directoryPluginSchema).max(MAX_API_PLUGIN_COUNT),
  count: z.number().int().nonnegative().max(MAX_API_PLUGIN_COUNT),
  generatedAt: z.iso.datetime(),
})

export type DirectoryPlugin = z.infer<typeof directoryPluginSchema>
export type DirectoryCatalog = z.infer<typeof directoryCatalogSchema>

function boundedString(value: string, maximum: number): string {
  return value.slice(0, maximum)
}

function serializedBytes(value: unknown): number {
  return utf8Encoder.encode(JSON.stringify(value)).byteLength
}

/**
 * Keep the public API to the fields understood by the companion plugin. Each
 * record is capped at 32,000 serialized bytes, so 500 records plus the JSON
 * envelope remain below the consumer's 16 MiB response limit. README source
 * gets an additional explicit character cap before competing for that budget.
 */
export function projectPluginForDirectory(
  plugin: PluginRecord
): DirectoryPlugin {
  if (
    plugin.id.length > 200 ||
    plugin.repo.length > 200 ||
    plugin.url.length > 2_048 ||
    (plugin.path?.length ?? 0) > 500
  ) {
    throw new Error(
      `Plugin ${plugin.id.slice(0, 200)} has overlong identity data`
    )
  }

  const security =
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
  const projected: Record<string, unknown> = {
    id: plugin.id,
    repo: plugin.repo,
    url: plugin.url,
    name: boundedString(plugin.name, 200),
    description: boundedString(plugin.description, 1_000),
    categories: [],
    platforms: [],
    caveats: [],
    images: [],
    health: plugin.health,
    scannedAt: boundedString(plugin.scannedAt, 100),
    ...(plugin.path ? { path: plugin.path } : {}),
    ...(security ? { security } : {}),
    ...(plugin.scanError
      ? { scanError: boundedString(plugin.scanError, 4_000) }
      : {}),
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
    "images",
    plugin.images
      .filter(isTrustedRemoteImageUrl)
      .slice(0, 32)
      .map((value) => boundedString(value, 2_048))
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

  return projected as DirectoryPlugin
}

export function projectCatalogForDirectory(
  plugins: readonly PluginRecord[],
  generatedAt = new Date().toISOString()
): DirectoryCatalog {
  const projected = plugins
    .slice(0, MAX_API_PLUGIN_COUNT)
    .map(projectPluginForDirectory)
  return { plugins: projected, count: projected.length, generatedAt }
}

export function createOpenApiDocument() {
  const pluginSchema = z.toJSONSchema(directoryPluginSchema)
  const catalogSchema = z.toJSONSchema(directoryCatalogSchema)
  delete pluginSchema.$schema
  delete catalogSchema.$schema

  return {
    openapi: "3.1.0",
    info: {
      title: `${SITE_NAME} directory API`,
      version: "1.0.0",
      description: SITE_DESCRIPTION,
    },
    servers: [{ url: SITE_URL }],
    paths: {
      "/api/plugins": {
        get: {
          summary: "List every plugin",
          operationId: "listPlugins",
          responses: {
            "200": {
              description: "The generated plugin catalog",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PluginCatalog" },
                },
              },
            },
          },
        },
      },
      "/api/plugin/{id}.json": {
        get: {
          summary: "Get one plugin",
          operationId: "getPlugin",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "One generated plugin record",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Plugin" },
                },
              },
            },
            "404": { description: "Plugin not found" },
          },
        },
      },
    },
    components: {
      schemas: {
        Plugin: pluginSchema,
        PluginCatalog: catalogSchema,
      },
    },
  }
}
