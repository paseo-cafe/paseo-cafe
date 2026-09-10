import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"

const readmeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tagName) => tagName !== "img"
  ),
}

/**
 * Renders an excerpt of a plugin author's README to sanitized HTML — run
 * once at scan time (scripts/scan.ts), never in the browser, so the site
 * ships no markdown parser and the frontend never dangerouslySetInnerHTML's
 * un-sanitized third-party content.
 *
 * Deliberately no rehype-raw: raw HTML embedded in the source markdown is
 * escaped as plain text rather than parsed, which is the safe default for
 * content pulled from repos we don't control. The sanitizer's allowlist is
 * the second line of defense against anything remark-rehype itself produces,
 * and deliberately excludes images so a README cannot trigger remote beacons.
 */
export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize, readmeSchema)
    .use(rehypeStringify)
    .process(markdown)
  return String(file).trim()
}
