import { z } from "zod"

/**
 * Platforms a plugin is known to run on. There's no upstream standard for
 * this in paseo-plugin.json (it only defines `id` today) — this is our own
 * registry's convention. If Paseo ever formalizes something equivalent,
 * scripts/scan.ts should prefer that over this the same way it already
 * prefers package.json/paseo-plugin.json over registry defaults elsewhere.
 */
export const PLATFORMS = ["macos", "linux", "windows"] as const
export type Platform = (typeof PLATFORMS)[number]
export const PLATFORM_LABELS: Record<Platform, string> = {
  macos: "macOS",
  linux: "Linux",
  windows: "Windows",
}

export const registryIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "registry filename must be lowercase kebab-case, e.g. 'subagent-activity.json'"
  )

/**
 * A registry entry is the *only* thing a plugin author writes by hand. It is
 * a pointer at a repo (and optional subpath, since several authors publish a
 * monorepo of plugins) plus a couple of curator-assigned hints. Everything
 * else shown on the site is derived by the scanner (see scripts/scan.ts)
 * from files that already live in the plugin's own repo.
 */
export const registryEntrySchema = z
  .object({
    /** Transitional compatibility for registry entries created before filename-derived IDs. */
    id: registryIdSchema.optional(),
    /** GitHub "owner/repo". Just the repo, not a full URL. */
    repo: z
      .string()
      .regex(/^[\w.-]+\/[\w.-]+$/, "repo must be in the form 'owner/repo'"),
    /**
     * Subpath within the repo containing paseo-plugin.json, for authors who
     * publish several plugins from one repo. Omit for single-plugin repos.
     */
    path: z.string().optional(),
    /** Optional curator/author-assigned categories, refined over time. */
    categories: z.array(z.string().min(1)).default([]),
    /**
     * Platforms this plugin is known to run on. Omit if it isn't
     * platform-restricted (or you don't know) — this is a positive
     * declaration ("known to work on"), not a guarantee for anything left out.
     */
    platforms: z.array(z.enum(PLATFORMS)).default([]),
    /**
     * Short, free-form limitations or requirements worth surfacing before
     * someone installs this — e.g. "Requires an OpenAI API key", "Experimental
     * — breaking changes expected". Keep each one to a single sentence.
     */
    caveats: z.array(z.string().min(1).max(140)).max(6).default([]),
    /** GitHub username of whoever submitted the PR, for attribution. */
    submittedBy: z.string().optional(),
  })
  .strict()

export type RegistryEntry = z.infer<typeof registryEntrySchema>
