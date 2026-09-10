import {
  OFFICIAL_GITHUB_ORG as CATALOG_OFFICIAL_GITHUB_ORG,
  isOfficialCatalogPlugin,
} from "../../plugin/shared/catalog"

/** Single source of truth for site identity — used by SEO meta, OG image generation, and the sitemap. */
export const SITE_NAME = "paseo.cafe"
export const SITE_TAGLINE = "A directory of paseo.sh plugins"
export const SITE_DESCRIPTION =
  "An independent, community-run directory of paseo.sh plugins, generated straight from each plugin's own GitHub repo."
export const SITE_REPO = "paseo-cafe/paseo-cafe"
/**
 * Where this particular deployment lives, and the path it is served under.
 * Default to the canonical site; the deploy workflow overrides both from
 * actions/configure-pages, so a fork publishes correct links and canonical
 * URLs for its own Pages site without editing any of this.
 *
 * A custom domain (paseo.cafe) is served from the root, while a fork's project
 * site is served from https://<owner>.github.io/<repo>/ — so the base path is
 * not always "/" and nothing may assume it is.
 *
 * Read through import.meta.env so one definition reaches both sides: Vite
 * inlines VITE_* variables into the browser bundle, and Bun maps
 * import.meta.env onto process.env for the scanner scripts.
 */
export const SITE_URL = (
  import.meta.env.VITE_SITE_URL ?? "https://paseo.cafe"
).replace(/\/+$/, "")

/** Normalized to "/" or "/segment/" — always both a leading and a trailing slash, so joins are unambiguous. */
export const BASE_PATH = normalizeBasePath(import.meta.env.VITE_BASE_PATH)

function normalizeBasePath(value: string | undefined): string {
  const trimmed = (value ?? "").replace(/^\/+|\/+$/g, "")
  return trimmed ? `/${trimmed}/` : "/"
}

/** What TanStack Router wants: "" at the root, "/segment" otherwise (no trailing slash). */
export const ROUTER_BASE_PATH = BASE_PATH.replace(/\/$/, "")

/**
 * Turns a root-relative public asset path into one that works under BASE_PATH.
 * Vite rewrites the assets it bundles, but anything referenced by literal path
 * — favicons, manifest icons — is on us.
 */
export function asset(path: string): string {
  return `${BASE_PATH}${path.replace(/^\/+/, "")}`
}

/** The GitHub org that publishes official paseo.cafe plugins. */
export const OFFICIAL_GITHUB_ORG = CATALOG_OFFICIAL_GITHUB_ORG

/** Whether a plugin is published by the official paseo.cafe org, not a third party. */
export const isOfficialPlugin = isOfficialCatalogPlugin
