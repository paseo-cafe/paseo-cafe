/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PluginInstallSection } from "@/components/plugin-install-section"
import { pluginRecordSchema } from "@/lib/plugin-schema"

const INTEGRITY = `sha512-${"a".repeat(86)}`
const PREVIEW_INTEGRITY = `sha512-${"b".repeat(86)}`

function pluginWithPreview() {
  return pluginRecordSchema.parse({
    id: "example",
    repo: "acme/example",
    package: "@acme/example",
    url: "https://github.com/acme/example",
    name: "Example",
    description: "Example plugin",
    descriptionNodes: [{ type: "text", text: "Example plugin" }],
    version: "1.2.3",
    npm: {
      package: "@acme/example",
      version: "1.2.3",
      integrity: INTEGRITY,
      publishedAt: "2026-09-01T00:00:00.000Z",
    },
    npmSecurity: {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 0,
      version: "1.2.3",
      integrity: INTEGRITY,
    },
    npmPreview: {
      package: "@acme/example",
      version: "1.3.0-next.1",
      integrity: PREVIEW_INTEGRITY,
      publishedAt: "2026-09-18T00:00:00.000Z",
      distTag: "next",
    },
    npmPreviewSecurity: {
      status: "passed",
      blockingFindings: 0,
      advisoryFindings: 1,
      version: "1.3.0-next.1",
      integrity: PREVIEW_INTEGRITY,
    },
    categories: [],
    platforms: [],
    caveats: [],
    caveatNodes: [],
    health: {
      manifestValid: true,
      hasReadme: true,
      hasLicense: true,
      hasTests: true,
      hasTypecheckScript: true,
      updatedRecently: true,
    },
    images: [],
    videos: [],
    scannedAt: "2026-09-19T00:00:00.000Z",
  })
}

afterEach(cleanup)

describe("PluginInstallSection", () => {
  it("keeps stable primary and offers an exact scanned preview", () => {
    render(<PluginInstallSection plugin={pluginWithPreview()} />)

    expect(
      screen.getByText("paseo plugin add npm:@acme/example@1.2.3")
    ).toBeDefined()
    expect(screen.getByText("Preview")).toBeDefined()
    expect(screen.getByText(/npm dist-tag: next/)).toBeDefined()
    expect(
      screen.getByText("paseo plugin add npm:@acme/example@1.3.0-next.1")
    ).toBeDefined()
    expect(
      screen.getByRole("button", { name: "Copy preview install command" })
    ).toBeDefined()
  })

  it("does not advertise preview without an attested release", () => {
    const plugin = pluginWithPreview()
    const withoutPreview = {
      ...plugin,
      npmPreview: undefined,
      npmPreviewSecurity: undefined,
    }

    render(<PluginInstallSection plugin={withoutPreview} />)

    expect(screen.queryByText("Preview")).toBeNull()
    expect(
      screen.queryByRole("button", { name: "Copy preview install command" })
    ).toBeNull()
  })
})
