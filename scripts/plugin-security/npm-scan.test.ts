import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { extractNpmPackage, resolveNpmPackage } from "../npm-registry.ts"
import { scanNpmTarget } from "./scan.ts"

vi.mock("../npm-registry.ts", () => ({
  resolveNpmPackage: vi.fn(),
  extractNpmPackage: vi.fn(),
}))

const COMMIT = "a".repeat(40)
const INTEGRITY = `sha512-${"b".repeat(86)}`

describe("npm security scan", () => {
  it("scans the exact resolved package contents", async () => {
    vi.mocked(resolveNpmPackage).mockResolvedValue({
      package: "@acme/review",
      version: "1.2.3",
      integrity: INTEGRITY,
      resolved: "https://registry.npmjs.org/@acme/review/-/review-1.2.3.tgz",
    })
    vi.mocked(extractNpmPackage).mockImplementation(
      async (_release, destination) => {
        await mkdir(destination, { recursive: true })
        await writeFile(
          join(destination, "paseo-plugin.json"),
          JSON.stringify({
            id: "review",
            requirements: { paseo: ">=0.8.0 <0.10.0" },
            description: "Published npm plugin",
          })
        )
        await writeFile(
          join(destination, "package.json"),
          JSON.stringify({ name: "@acme/review", version: "1.2.3" })
        )
        await writeFile(
          join(destination, "index.client.tsx"),
          "export default function contribute() { return () => {} }\n"
        )
      }
    )

    const result = await scanNpmTarget(
      {
        id: "review",
        repo: "acme/review",
        package: "@acme/review",
        ref: COMMIT,
        commit: COMMIT,
      },
      "2026-09-18T00:00:00.000Z"
    )

    expect(result).toMatchObject({
      package: "@acme/review",
      version: "1.2.3",
      integrity: INTEGRITY,
      status: "passed",
      blockingFindings: 0,
    })
  })
})
