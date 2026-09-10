import { readFile } from "node:fs/promises"

const entrypoint = await readFile(".output/public/index.html", "utf8").catch(
  () => undefined
)

if (
  !entrypoint?.includes("<title>paseo.cafe</title>") ||
  !entrypoint?.includes("All plugins")
) {
  throw new Error(
    "GitHub Pages build must emit a rendered .output/public/index.html catalog entrypoint"
  )
}
