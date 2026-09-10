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
export const SITE_URL = "https://paseo.cafe"

/** The GitHub org that publishes official paseo.cafe plugins. */
export const OFFICIAL_GITHUB_ORG = CATALOG_OFFICIAL_GITHUB_ORG

/** Whether a plugin is published by the official paseo.cafe org, not a third party. */
export const isOfficialPlugin = isOfficialCatalogPlugin
