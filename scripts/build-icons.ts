/**
 * Derives the committed favicon rasters from public/favicon.svg, which is the
 * single source of truth for the paseo.cafe mark. Run with `bun run icons:build`
 * after editing that SVG; the outputs are committed, so this never runs at
 * build or request time.
 *
 * The 16px frame is rendered from a deliberately different variant: at that
 * size the 1.75-unit outline lands on well under a pixel and smears into grey,
 * and the accent square shrinks to a single stray dot. So the small frame drops
 * the accent, tightens the padding, and thickens the stroke — the usual favicon
 * trade of exact fidelity for legibility.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { Resvg } from "@resvg/resvg-js"

// Scripts are always invoked via `bun run` from the repo root (see package.json).
const PUBLIC_DIR = join(process.cwd(), "public")
const SOURCE = join(PUBLIC_DIR, "favicon.svg")

const ICO_SIZES = [16, 32, 48] as const
const APPLE_TOUCH_SIZE = 180

function render(svg: string, size: number): Buffer {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } })
  return resvg.render().asPng()
}

/** Bolder, edge-to-edge variant of the mark, for frames of 16px and under. */
function smallVariant(svg: string): string {
  return svg
    .replace(/\s*<rect x="50\.1"[^>]*\/>/, "")
    .replace(
      'transform="translate(63.92 63.92) scale(16.004)"',
      'transform="translate(30 30) scale(18.5)"'
    )
    .replace('stroke-width="1.75"', 'stroke-width="2.5"')
}

/** Packs PNG frames into an .ico. PNG-compressed frames are read by every current browser. */
function packIco(frames: { size: number; png: Buffer }[]): Buffer {
  const directory = Buffer.alloc(6 + frames.length * 16)
  directory.writeUInt16LE(0, 0) // reserved
  directory.writeUInt16LE(1, 2) // type: icon
  directory.writeUInt16LE(frames.length, 4)

  let offset = directory.length
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16
    // 256px is encoded as 0 in this field; nothing here is that large.
    directory.writeUInt8(frame.size, entry)
    directory.writeUInt8(frame.size, entry + 1)
    directory.writeUInt8(0, entry + 2) // palette entries
    directory.writeUInt8(0, entry + 3) // reserved
    directory.writeUInt16LE(1, entry + 4) // color planes
    directory.writeUInt16LE(32, entry + 6) // bits per pixel
    directory.writeUInt32LE(frame.png.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    offset += frame.png.length
  })

  return Buffer.concat([directory, ...frames.map((frame) => frame.png)])
}

const svg = readFileSync(SOURCE, "utf8")
const small = smallVariant(svg)
if (small === svg) {
  throw new Error(
    `${SOURCE} no longer matches what smallVariant() rewrites — update scripts/build-icons.ts`
  )
}

const frames = ICO_SIZES.map((size) => ({
  size,
  png: render(size <= 16 ? small : svg, size),
}))

writeFileSync(join(PUBLIC_DIR, "favicon.ico"), packIco(frames))
writeFileSync(
  join(PUBLIC_DIR, "apple-touch-icon.png"),
  render(svg, APPLE_TOUCH_SIZE)
)

console.log(
  `Wrote favicon.ico (${ICO_SIZES.join(", ")}px) and apple-touch-icon.png (${APPLE_TOUCH_SIZE}px) to public/`
)
