/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PluginSecurityScan } from "@/components/plugin-security-scan"
import type { PluginSecurity } from "@/lib/plugin-schema"
import { sanitizeReadmeHtmlForDisplay } from "@/lib/sanitize-readme-html"

const staleUnknownSecurity: PluginSecurity = {
  status: "unknown",
  blockingFindings: 13,
  advisoryFindings: 21,
  scannedAt: "2026-09-09T12:34:56.000Z",
  commit: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  reportUrl: "https://example.com/stale-security-report",
}

const publishedSecurity: PluginSecurity = {
  status: "passed",
  blockingFindings: 0,
  advisoryFindings: 2,
  scannedAt: "2026-09-09T12:34:56.000Z",
  commit: "0123456789abcdef0123456789abcdef01234567",
  reportUrl: "https://example.com/security-report",
}

afterEach(cleanup)

describe("sanitizeReadmeHtmlForDisplay", () => {
  it("removes images and leaves only absolute, mail, and fragment links clickable", () => {
    const sanitized = sanitizeReadmeHtmlForDisplay(
      [
        '<img src="https://tracker.example/pixel.gif" onerror="alert(1)">',
        '<a href="LICENSE">License</a>',
        "<a href='../README.md'>Readme</a>",
        '<a href="/plugins/LICENSE">Root relative</a>',
        '<a href="javascript:alert(1)">Script</a>',
        '<a href="data:text/html,boom">Data</a>',
        '<a href="https://example.com/docs">HTTPS</a>',
        '<a href="http://example.com/docs">HTTP</a>',
        '<a href="mailto:author@example.com">Mail</a>',
        '<a href="#usage">Usage</a>',
      ].join("")
    )

    const container = document.createElement("div")
    container.innerHTML = sanitized
    expect(container.querySelector("img")).toBeNull()

    const hrefByText = Object.fromEntries(
      [...container.querySelectorAll("a")].map((link) => [
        link.textContent ?? "",
        link.getAttribute("href"),
      ])
    ) as Record<string, string | null>
    expect(hrefByText.License).toBeNull()
    expect(hrefByText.Readme).toBeNull()
    expect(hrefByText["Root relative"]).toBeNull()
    expect(hrefByText.Script).toBeNull()
    expect(hrefByText.Data).toBeNull()
    expect(hrefByText.HTTPS).toBe("https://example.com/docs")
    expect(hrefByText.HTTP).toBe("http://example.com/docs")
    expect(hrefByText.Mail).toBe("mailto:author@example.com")
    expect(hrefByText.Usage).toBe("#usage")
  })
})

describe("PluginSecurityScan", () => {
  it.each([
    ["missing", undefined],
    ["unknown", staleUnknownSecurity],
  ] as const)(
    "shows no attestation details when security is %s",
    (_label, security) => {
      render(<PluginSecurityScan security={security} />)

      const alert = screen.getByRole("alert")
      expect(
        within(alert).getByText(
          "No published security scan is available for this plugin yet."
        )
      ).toBeDefined()
      expect(alert.textContent).not.toContain("13")
      expect(alert.textContent).not.toContain("21")
      expect(alert.textContent).not.toContain("2026-09-09")
      expect(alert.textContent).not.toContain(staleUnknownSecurity.commit)
      expect(
        within(alert).queryByRole("link", { name: "Open security report" })
      ).toBeNull()
    }
  )

  it.each(["passed", "failed"] as const)(
    "shows metadata for a published %s attestation",
    (status) => {
      const security: PluginSecurity = { ...publishedSecurity, status }
      render(<PluginSecurityScan security={security} />)

      const alert = screen.getByRole("alert")
      expect(alert.textContent).toContain("Blocking findings: 0")
      expect(alert.textContent).toContain("Advisory findings: 2")
      expect(alert.textContent).toContain(security.commit)
      const reportLink = within(alert).getByRole("link", {
        name: "Open security report",
      })
      expect(reportLink.getAttribute("href")).toBe(security.reportUrl)
    }
  )
})
