import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PluginSecurity } from "../src/lib/plugin-schema"
import {
  loadPublishedSecurityCatalog,
  scanOne,
  securityForRevision,
} from "./scan"

const REVISION = "0123456789abcdef0123456789abcdef01234567"
const OTHER_REVISION = "fedcba9876543210fedcba9876543210fedcba98"
const SCANNED_AT = "2026-09-09T00:00:00.000Z"
const originalFetch = globalThis.fetch
const temporaryRoots: string[] = []

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function scannerArtifact(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    generatedAt: SCANNED_AT,
    plugins: {
      example: {
        commit: REVISION,
        scannedAt: SCANNED_AT,
        status: "passed",
        blockingFindings: 0,
        advisoryFindings: 0,
        coverage: { files: 3, bytes: 128 },
        buildCommands: [],
        findings: [],
        ...overrides,
      },
    },
  }
}

function temporaryDirectory(): string {
  const root = mkdtempSync(join(tmpdir(), "paseo-cafe-scan-"))
  temporaryRoots.push(root)
  return root
}

describe("securityForRevision", () => {
  it("requires an unknown result's commit to match the scanned revision", () => {
    const result: PluginSecurity = {
      status: "unknown",
      blockingFindings: 1,
      advisoryFindings: 2,
      scannedAt: SCANNED_AT,
      commit: REVISION,
    }

    expect(securityForRevision(result, REVISION)).toBe(result)
    expect(securityForRevision(result, OTHER_REVISION)).toBeUndefined()
  })

  it("normalizes a valid repository revision before matching", () => {
    const result: PluginSecurity = {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      commit: REVISION,
    }

    expect(securityForRevision(result, `  ${REVISION.toUpperCase()}  `)).toBe(
      result
    )
    expect(securityForRevision(result, REVISION.slice(1))).toBeUndefined()
  })

  it("removes stale diagnostics from a commitless unknown result", () => {
    expect(
      securityForRevision(
        {
          status: "unknown",
          blockingFindings: 4,
          advisoryFindings: 9,
          scannedAt: SCANNED_AT,
          reportUrl: "https://example.com/stale-report",
        },
        REVISION
      )
    ).toEqual({
      status: "unknown",
      blockingFindings: 0,
      advisoryFindings: 0,
    })
  })
})

describe("loadPublishedSecurityCatalog", () => {
  it("loads the canonical scanner artifact and maps unavailable to unknown", () => {
    const root = temporaryDirectory()
    const artifactPath = join(root, "plugin-security-results.json")
    writeFileSync(
      artifactPath,
      JSON.stringify(
        scannerArtifact({ status: "unavailable", blockingFindings: 1 })
      )
    )

    expect(loadPublishedSecurityCatalog(artifactPath)).toEqual({
      example: {
        status: "unknown",
        blockingFindings: 1,
        advisoryFindings: 0,
        scannedAt: SCANNED_AT,
        commit: REVISION,
      },
    })
  })

  it("rejects artifacts from an older schema version", () => {
    const root = temporaryDirectory()
    const artifactPath = join(root, "plugin-security-results.json")
    writeFileSync(
      artifactPath,
      JSON.stringify({ ...scannerArtifact(), version: 0 })
    )

    expect(loadPublishedSecurityCatalog(artifactPath)).toEqual({})
  })

  it("rejects malformed current artifacts instead of accepting older shapes", () => {
    const root = temporaryDirectory()
    const artifactPath = join(root, "plugin-security-results.json")
    const legacyPath = join(root, "plugin-security.json")
    writeFileSync(
      artifactPath,
      JSON.stringify({
        version: 1,
        generatedAt: SCANNED_AT,
        plugins: {
          example: {
            commit: REVISION,
            scannedAt: SCANNED_AT,
            status: "review-required",
            blockingFindings: 0,
            advisoryFindings: 1,
          },
        },
      })
    )
    writeFileSync(
      legacyPath,
      JSON.stringify({
        example: {
          status: "passed",
          blockingFindings: 0,
          advisoryFindings: 0,
          commit: REVISION,
        },
      })
    )

    expect(loadPublishedSecurityCatalog(artifactPath)).toEqual({})
  })
})

function exampleRegistry(): string {
  const registryRoot = temporaryDirectory()
  writeFileSync(
    join(registryRoot, "example.json"),
    JSON.stringify({ repo: "acme/widgets", path: "plugin" })
  )
  return registryRoot
}

function mockRepository(
  commitResponse: Response,
  packageVersion: unknown
): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === "https://api.github.com/repos/acme/widgets") {
      return Response.json({
        full_name: "acme/widgets",
        description: "Repository description",
        default_branch: "main",
        stargazers_count: 42,
        open_issues_count: 3,
        pushed_at: "2026-09-01T00:00:00.000Z",
        archived: false,
        topics: ["paseo"],
        license: { spdx_id: "MIT" },
        html_url: "https://github.com/acme/widgets",
        owner: {
          login: "acme",
          avatar_url: "https://avatars.githubusercontent.com/u/1",
          html_url: "https://github.com/acme",
        },
      })
    }
    if (url === "https://api.github.com/repos/acme/widgets/commits/main") {
      return commitResponse
    }
    if (
      url ===
        "https://api.github.com/repos/acme/widgets/contents/plugin?ref=main" ||
      url ===
        `https://api.github.com/repos/acme/widgets/contents/plugin?ref=${REVISION}`
    ) {
      return Response.json([
        {
          name: "README.md",
          path: "plugin/README.md",
          type: "file",
          download_url: null,
        },
        {
          name: "LICENSE",
          path: "plugin/LICENSE",
          type: "file",
          download_url: null,
        },
        {
          name: "images",
          path: "plugin/images",
          type: "dir",
          download_url: null,
        },
      ])
    }
    if (
      url ===
      `https://api.github.com/repos/acme/widgets/contents/plugin/images?ref=${REVISION}`
    ) {
      return Response.json([
        {
          name: "local.png",
          path: "plugin/images/local.png",
          type: "file",
          download_url: null,
        },
      ])
    }
    if (url.endsWith("/plugin/paseo-plugin.json")) {
      return Response.json({ id: "example" })
    }
    if (url.endsWith("/plugin/package.json")) {
      return Response.json({
        description: "Package description",
        version: packageVersion,
        scripts: { test: "vitest" },
      })
    }
    if (url.endsWith("/plugin/README.md")) {
      return new Response(
        "# Example\n\nUseful plugin.\n\n![local](images/local.png)\n![hosted](https://cdn.example.com/hosted.png)"
      )
    }
    throw new Error(`unexpected request: ${url}`)
  }) as typeof fetch
}

describe("scanOne", () => {
  it("keeps branch metadata without attaching security when commit resolution fails", async () => {
    const registryRoot = exampleRegistry()
    mockRepository(new Response("temporary outage", { status: 503 }), "1.2.3")

    const record = await scanOne(
      "example.json",
      {
        example: {
          status: "passed",
          blockingFindings: 0,
          advisoryFindings: 0,
          scannedAt: SCANNED_AT,
          commit: REVISION,
        },
      },
      registryRoot
    )

    expect(record.description).toBe("Package description")
    expect(record.version).toBe("1.2.3")
    expect(record.health).toMatchObject({
      manifestValid: true,
      hasReadme: true,
      hasLicense: true,
      hasTests: true,
    })
    expect(record.repoMeta).toMatchObject({
      stars: 42,
      defaultBranch: "main",
    })
    expect(record.url).toBe("https://github.com/acme/widgets/tree/main/plugin")
    expect(record.security).toBeUndefined()
    expect(record.images).toEqual([])
    expect(record.scanError).toContain("default branch commit unavailable")
    expect(record.scanError).not.toContain("temporary outage")
  })

  it.each([undefined, "not-semver"])(
    "omits a missing or invalid package version (%s)",
    async (packageVersion) => {
      const registryRoot = exampleRegistry()
      mockRepository(Response.json({ sha: REVISION }), packageVersion)

      const record = await scanOne("example.json", {}, registryRoot)

      expect(record.version).toBeUndefined()
      expect(record.scanError).toBeUndefined()
    }
  )

  it("flags a placeholder package version", async () => {
    const registryRoot = exampleRegistry()
    mockRepository(Response.json({ sha: REVISION }), "0.0.0")

    const record = await scanOne("example.json", {}, registryRoot)

    expect(record.version).toBe("0.0.0")
    expect(record.scanError).toBe(
      'package.json version "0.0.0" is a placeholder; publish a real release version'
    )
  })

  it("publishes a generic scan error without upstream response details", async () => {
    const registryRoot = exampleRegistry()
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    globalThis.fetch = vi.fn(
      async () =>
        new Response("internal service at 10.0.0.7 failed", { status: 500 })
    ) as typeof fetch

    const record = await scanOne("example.json", {}, registryRoot)

    expect(record.scanError).toBe(
      "scan failed while reading repository: acme/widgets/plugin"
    )
    expect(record.scanError).not.toContain("10.0.0.7")
  })

  it("uses the default branch for human links and the commit for attestations and raw assets", async () => {
    const registryRoot = exampleRegistry()
    mockRepository(Response.json({ sha: REVISION }), "1.2.3")

    const security: PluginSecurity = {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      scannedAt: SCANNED_AT,
      commit: REVISION,
    }
    const record = await scanOne(
      "example.json",
      { example: security },
      registryRoot
    )

    expect(record.url).toBe("https://github.com/acme/widgets/tree/main/plugin")
    expect(record.security).toEqual(security)
    expect(record.images).toEqual([
      `https://raw.githubusercontent.com/acme/widgets/${REVISION}/plugin/images/local.png`,
    ])
    expect(record.scanError).toBeUndefined()
  })
})
