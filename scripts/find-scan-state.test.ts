import { describe, expect, it, vi } from "vitest"
import { findTrustedScanState } from "./find-scan-state"

const ARTIFACT_NAME = "registry-scan-state-v1"

describe("trusted registry scan state discovery", () => {
  it("selects the newest successful main deployment artifact", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes("/actions/artifacts?")) {
        return Response.json({
          artifacts: [
            {
              id: 3,
              name: ARTIFACT_NAME,
              expired: false,
              created_at: "2026-09-20T03:00:00Z",
              workflow_run: { id: 30, head_branch: "feature" },
            },
            {
              id: 2,
              name: ARTIFACT_NAME,
              expired: false,
              created_at: "2026-09-20T02:00:00Z",
              workflow_run: { id: 20, head_branch: "main" },
            },
            {
              id: 1,
              name: ARTIFACT_NAME,
              expired: false,
              created_at: "2026-09-20T01:00:00Z",
              workflow_run: { id: 10, head_branch: "main" },
            },
          ],
        })
      }
      if (url.endsWith("/actions/runs/30")) {
        return Response.json({
          id: 30,
          conclusion: "success",
          head_branch: "feature",
          path: ".github/workflows/deploy-pages.yml",
        })
      }
      if (url.endsWith("/actions/runs/20")) {
        return Response.json({
          id: 20,
          conclusion: "failure",
          head_branch: "main",
          path: ".github/workflows/deploy-pages.yml",
        })
      }
      if (url.endsWith("/actions/runs/10")) {
        return Response.json({
          id: 10,
          conclusion: "success",
          head_branch: "main",
          path: ".github/workflows/deploy-pages.yml",
        })
      }
      return new Response("not found", { status: 404 })
    })

    await expect(
      findTrustedScanState({
        repository: "paseo-cafe/paseo-cafe",
        defaultBranch: "main",
        currentRunId: 99,
        token: "token",
        fetcher: fetcher as typeof fetch,
      })
    ).resolves.toEqual({ artifactId: 1, runId: 10 })
    expect(fetcher.mock.calls[0]?.[0]).toContain(`name=${ARTIFACT_NAME}`)
  })

  it("returns no state when every matching artifact is expired", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        artifacts: [
          {
            id: 1,
            name: ARTIFACT_NAME,
            expired: true,
            created_at: "2026-09-20T01:00:00Z",
            workflow_run: { id: 10, head_branch: "main" },
          },
        ],
      })
    )

    await expect(
      findTrustedScanState({
        repository: "paseo-cafe/paseo-cafe",
        defaultBranch: "main",
        token: "token",
        fetcher: fetcher as typeof fetch,
      })
    ).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
