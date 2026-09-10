const LEGACY_README_IMAGE_TAG = /<img\b[^>]*>/gi
const README_LINK_HREF =
  /(<a\b[^>]*?)\s+href=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi
const SAFE_README_LINK = /^(?:https?:\/\/|mailto:|#)/i

/**
 * New scans remove README images in src/lib/markdown.ts. This final
 * compatibility guard also protects visitors from image beacons and broken
 * relative navigation in previously generated catalog data.
 */
export function sanitizeReadmeHtmlForDisplay(html: string): string {
  return html
    .replace(LEGACY_README_IMAGE_TAG, "")
    .replace(README_LINK_HREF, (attribute, anchor, double, single, bare) => {
      const href = double ?? single ?? bare ?? ""
      return SAFE_README_LINK.test(href) ? attribute : anchor
    })
}
