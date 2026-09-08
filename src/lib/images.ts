import { extractGitHubAssetLinks } from "./videos"

const MAX_README_IMAGES = 8

// Markdown image syntax: ![alt](url "title") or ![alt](<url with spaces>) —
// the angle-bracket form is CommonMark's way to allow spaces in a URL, so it
// needs its own branch rather than stopping at the first whitespace.
const MARKDOWN_IMAGE_RE =
  /!\[[^\]]*\]\(\s*(?:<([^>]+)>|(\S+?))(?:\s+"[^"]*")?\s*\)/g

// A raw <img src="..."> tag — same GitHub-README-as-HTML pattern as <video src> in videos.ts.
const IMG_TAG_RE = /<img[^>]*\ssrc=["']([^"'<>]+)["'][^>]*>/gi

/**
 * Best-effort extraction of image references from a README: markdown image
 * syntax and raw <img> tags. Deliberately broader than an images/ directory
 * convention — repo owners drop screenshots in docs/, .github/, a bare root
 * file, or paste them straight into the README via GitHub's asset uploader,
 * same reasoning as extractVideos in videos.ts. References may be absolute
 * URLs or paths relative to the README — resolving a relative path against
 * the real repo tree happens in scripts/scan.ts, the only place that knows
 * the owner/repo/branch/subpath.
 *
 * GitHub asset-hosting links (github.com/user-attachments/assets/...) are
 * excluded here even when they appear in `![]()`/`<img>` syntax — they carry
 * no file extension and are just as often a video, so they're left for
 * resolveGitHubAssetImages to disambiguate by content type.
 */
export function extractReadmeImages(readme: string): string[] {
  const assetLinks = new Set(extractGitHubAssetLinks(readme))
  const seen = new Set<string>()
  const images: string[] = []

  const add = (raw: string) => {
    const trimmed = raw.trim()
    if (
      !trimmed ||
      assetLinks.has(trimmed) ||
      seen.has(trimmed) ||
      images.length >= MAX_README_IMAGES
    ) {
      return
    }
    seen.add(trimmed)
    images.push(trimmed)
  }

  for (const match of readme.matchAll(MARKDOWN_IMAGE_RE))
    add(match[1] || match[2])
  for (const match of readme.matchAll(IMG_TAG_RE)) add(match[1])

  return images
}

/**
 * Resolves a README's ambiguous GitHub asset links to image URLs by content
 * type — same technique as resolveGitHubAssetVideos in videos.ts, just
 * checking for `image/*` instead of `video/*`. `existing` is whatever
 * extractReadmeImages already found (asset links are always excluded there,
 * so this never double-counts one), and still counts toward the same cap.
 */
export async function resolveGitHubAssetImages(
  readme: string,
  resolveContentType: (url: string) => Promise<string | null>,
  existing: string[] = []
): Promise<string[]> {
  const found: string[] = []
  for (const url of extractGitHubAssetLinks(readme)) {
    if (existing.length + found.length >= MAX_README_IMAGES) break
    const contentType = await resolveContentType(url)
    if (contentType?.startsWith("image/")) found.push(url)
  }
  return found
}

export { MAX_README_IMAGES }
