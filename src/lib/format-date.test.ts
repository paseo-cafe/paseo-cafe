import { describe, expect, it } from "vitest"
import {
  formatDate,
  formatDateLocalized,
  formatDateTime,
  formatDateTimeLocalized,
} from "./format-date"

describe("formatDate", () => {
  it("formats a UTC date with zero-padded day and full month name", () => {
    expect(formatDate("2026-08-31T21:03:59Z")).toBe("31 Aug 2026")
  })

  it("zero-pads single-digit days", () => {
    expect(formatDate("2026-01-05T00:00:00Z")).toBe("05 Jan 2026")
  })
})

describe("formatDateTime", () => {
  it("appends a zero-padded UTC time", () => {
    expect(formatDateTime("2026-09-01T14:11:35Z")).toBe(
      "01 Sep 2026, 14:11 UTC"
    )
  })
})

describe("formatDateLocalized", () => {
  it("uses the reader's own date format", () => {
    const iso = "2026-01-09T12:00:00Z"
    expect(formatDateLocalized(iso, "en-US")).toBe("Jan 9, 2026")
    expect(formatDateLocalized(iso, "en-GB")).toBe("9 Jan 2026")
    expect(formatDateLocalized(iso, "ja-JP")).toBe("2026年1月9日")
  })

  it("keeps the UTC calendar day whatever the runtime's timezone is", () => {
    // Late enough in the day to land on the 10th anywhere east of UTC, and
    // early enough to land on the 8th anywhere west of it.
    expect(formatDateLocalized("2026-01-09T23:59:00Z", "en-GB")).toBe(
      "9 Jan 2026"
    )
    expect(formatDateLocalized("2026-01-09T00:01:00Z", "en-GB")).toBe(
      "9 Jan 2026"
    )
  })

  it("falls back to the deterministic format for an unreadable date", () => {
    expect(formatDateLocalized("not a date", "en-US")).toBe(
      formatDate("not a date")
    )
  })
})

describe("formatDateTimeLocalized", () => {
  // Assertions avoid September: CLDR abbreviates it "Sept" in some locales
  // and "Sep" in others, which is ICU-version dependent and not what's under
  // test here.
  it("keeps the UTC clock and labels it", () => {
    const formatted = formatDateTimeLocalized("2026-01-09T14:11:35Z", "en-GB")
    expect(formatted).toContain("9 Jan 2026")
    expect(formatted).toContain("14:11")
    expect(formatted).toContain("UTC")
  })

  it("falls back to the deterministic format for an unreadable date", () => {
    expect(formatDateTimeLocalized("nope", "en-US")).toBe(
      formatDateTime("nope")
    )
  })
})
