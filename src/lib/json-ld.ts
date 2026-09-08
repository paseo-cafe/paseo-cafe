import type { PluginRecord } from "@/lib/plugin-schema"
import { PLATFORM_LABELS } from "@/lib/registry-schema"
import { SITE_URL } from "@/lib/site"

/**
 * schema.org SoftwareApplication structured data for a plugin's detail
 * page — rendered as a <script type="application/ld+json"> in the route
 * component. Keys with an `undefined` value are dropped by JSON.stringify
 * automatically, so optional fields just aren't included when unknown.
 */
export function pluginJsonLd(plugin: PluginRecord) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: plugin.name,
    description: plugin.description || undefined,
    url: `${SITE_URL}/plugins/${plugin.id}`,
    image: plugin.images[0] ?? `${SITE_URL}/og/${plugin.id}.png`,
    applicationCategory: "DeveloperApplication",
    // "Any" is the honest default here — most plugins aren't platform-restricted.
    // Only override it when the author (or the README heuristic) actually said so.
    operatingSystem:
      plugin.platforms.length > 0
        ? plugin.platforms.map((p) => PLATFORM_LABELS[p]).join(", ")
        : "Any",
    softwareVersion: plugin.version,
    license: plugin.license
      ? `https://spdx.org/licenses/${plugin.license}.html`
      : undefined,
    dateModified: plugin.repoMeta?.pushedAt,
    author: plugin.owner
      ? { "@type": "Person", name: plugin.owner.login, url: plugin.owner.url }
      : undefined,
    codeRepository: plugin.url,
  }
}

/** Serializes JSON-LD without allowing user-controlled data to close the script tag. */
export function serializePluginJsonLd(plugin: PluginRecord): string {
  return JSON.stringify(pluginJsonLd(plugin)).replaceAll("<", "\\u003c")
}
