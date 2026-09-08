/**
 * Renders branded 1200x630 Open Graph images at scan time — never on
 * request, since this site deploys to static hosting. Uses satori
 * (JSX → SVG) + resvg (SVG → PNG).
 *
 * Fonts are local static WOFF files under scripts/assets/, not the
 * variable woff2 files the site itself uses: satori doesn't support woff2
 * or variable fonts (both fail to parse). These two static weights were
 * fetched once from Google Fonts' legacy (pre-woff2) CSS endpoint and
 * committed here rather than re-fetched on every scan.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Resvg } from "@resvg/resvg-js"
import satori from "satori"

// Scripts are always invoked via `bun run` from the repo root (see package.json).
const ASSETS_DIR = join(process.cwd(), "scripts", "assets")

const fontRegular = readFileSync(join(ASSETS_DIR, "jetbrains-mono-400.woff"))
const fontBold = readFileSync(join(ASSETS_DIR, "jetbrains-mono-700.woff"))

const WIDTH = 1200
const HEIGHT = 630

const BG = "#0b0f10"
const FG = "#f5f7f6"
const MUTED = "#9aa6a5"
const SUBTLE = "#c7d0cf"
const ACCENT = "#2f8f88"
const BORDER = "rgba(255,255,255,0.15)"

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

export interface OgImageOptions {
  title: string
  description?: string
  badges?: string[]
}

export async function renderOgImage({
  title,
  description,
  badges = [],
}: OgImageOptions): Promise<Buffer> {
  const tree = (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: BG,
        padding: "64px",
        fontFamily: "JetBrains Mono",
        color: FG,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 26,
          color: MUTED,
        }}
      >
        <div
          style={{
            display: "flex",
            width: 16,
            height: 16,
            backgroundColor: ACCENT,
          }}
        />
        <div style={{ display: "flex" }}>paseo.cafe</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.15,
          }}
        >
          {truncate(title, 48)}
        </div>
        {description ? (
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: SUBTLE,
              lineHeight: 1.5,
            }}
          >
            {truncate(description, 130)}
          </div>
        ) : null}
      </div>
      {badges.length > 0 ? (
        <div style={{ display: "flex", gap: 12 }}>
          {badges.slice(0, 4).map((badge) => (
            <div
              key={badge}
              style={{
                display: "flex",
                border: `1px solid ${BORDER}`,
                padding: "8px 18px",
                fontSize: 22,
                color: SUBTLE,
              }}
            >
              {badge}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )

  const svg = await satori(tree, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      {
        name: "JetBrains Mono",
        data: fontRegular,
        weight: 400,
        style: "normal",
      },
      { name: "JetBrains Mono", data: fontBold, weight: 700, style: "normal" },
    ],
  })

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } })
  return Buffer.from(resvg.render().asPng())
}
