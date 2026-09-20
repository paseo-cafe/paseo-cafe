import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  extractNpmPackage,
  resolveNpmPackage,
  resolveNpmPackageReleases,
} from "../npm-registry.ts"
import { createScanPlan, sealScanPlan } from "../scan-plan.ts"
import { scanNpmTarget, scanPlannedTargets } from "./scan.ts"

vi.mock("../npm-registry.ts", () => ({
  resolveNpmPackage: vi.fn(),
  resolveNpmPackageReleases: vi.fn(),
  extractNpmPackage: vi.fn(),
}))
beforeEach(() => {
  vi.clearAllMocks()
})

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

  it("uses the release pinned in the plan without resolving mutable tags", async () => {
    const release = {
      package: "@acme/review",
      version: "1.2.3",
      integrity: INTEGRITY,
      resolved: "https://registry.npmjs.org/@acme/review/-/review-1.2.3.tgz",
    }
    vi.mocked(extractNpmPackage).mockImplementation(
      async (_release, destination) => {
        await mkdir(destination, { recursive: true })
        await writeFile(
          join(destination, "paseo-plugin.json"),
          JSON.stringify({
            id: "review",
            requirements: { paseo: ">=0.8.0 <0.10.0" },
          })
        )
        await writeFile(
          join(destination, "package.json"),
          JSON.stringify({ name: release.package, version: release.version })
        )
        await writeFile(
          join(destination, "index.client.tsx"),
          "export default function contribute() { return () => {} }\n"
        )
      }
    )

    const generatedPlan = await createScanPlan({
      entries: [
        {
          id: "review",
          repo: "acme/review",
          package: release.package,
          categories: [],
          platforms: [],
          caveats: [],
        },
      ],
      catalogDigest: "e".repeat(64),
      securityDigest: "f".repeat(64),
      mode: "npm",
      resolvers: {
        resolveCommit: async () => COMMIT,
        resolveGitVersion: async () => release.version,
        resolveNpm: async () => ({ latest: release }),
      },
      now: "2026-09-20T00:00:00.000Z",
    })
    const { planId: ignoredPlanId, ...planBody } = generatedPlan
    void ignoredPlanId
    const npmEntry = generatedPlan.entries[0]
    const plan = sealScanPlan({
      ...planBody,
      entries: [{ ...npmEntry, gitTarget: undefined }],
    })
    const results = await scanPlannedTargets(plan, "2026-09-20T00:01:00.000Z")
    const targetKey = plan.entries[0].npmTargets[0]?.targetKey
    if (!targetKey) throw new Error("missing npm target")

    expect(results.plugins.review?.npmLatest).toMatchObject({
      targetKey,
      result: {
        package: release.package,
        version: release.version,
        integrity: release.integrity,
        status: "passed",
      },
    })
    expect(extractNpmPackage).toHaveBeenCalledWith(
      release,
      expect.any(String),
      expect.any(String)
    )
    expect(resolveNpmPackage).not.toHaveBeenCalled()
    expect(resolveNpmPackageReleases).not.toHaveBeenCalled()
  })
})
