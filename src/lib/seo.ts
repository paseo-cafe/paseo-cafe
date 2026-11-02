import { SITE_NAME, SITE_URL } from "@/lib/site"

export interface SeoOptions {
  title: string
  description: string
  /** Root-relative path, e.g. "/plugins/subagent-activity". Used to build the canonical URL and og:url. */
  path: string
  /** Root-relative path to an OG image, e.g. "/og/subagent-activity.png". Defaults to the site-wide OG image. */
  image?: string
  type?: "website" | "article"
  /** Absolute URL that replaces this page: browsers are sent there and it becomes the canonical URL. */
  redirect?: string
}

/**
 * Builds the `meta` + canonical `links` for a route's `head()` — full Open
 * Graph and Twitter Card coverage from just a title/description/path, no
 * per-page boilerplate. OG images referenced here are generated at scan
 * time (scripts/og-image.ts), never rendered on request.
 */
export function seo({
  title,
  description,
  path,
  image = "/og/default.png",
  type = "website",
  redirect,
}: SeoOptions) {
  const url = `${SITE_URL}${path}`
  const imageUrl = `${SITE_URL}${image}`
  const fullTitle = title === SITE_NAME ? title : `${title} — ${SITE_NAME}`

  return {
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: type },
      { property: "og:url", content: url },
      { property: "og:image", content: imageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:url", content: url },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: imageUrl },
      ...(redirect
        ? [{ httpEquiv: "refresh", content: `0; url=${redirect}` }]
        : []),
    ],
    links: [{ rel: "canonical", href: redirect ?? url }],
  }
}
