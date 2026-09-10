import { describe, expect, it } from "vitest"
import { findVersionIntroducedAt } from "./version-history"

const commits = [
  { sha: "d", date: "2026-09-09T00:00:00Z" },
  { sha: "c", date: "2026-09-08T00:00:00Z" },
  { sha: "b", date: "2026-09-07T00:00:00Z" },
  { sha: "a", date: "2026-09-01T00:00:00Z" },
]

/** Reads from a sha → version map, standing in for the raw package.json fetch. */
const reader =
  (versions: Record<string, string | undefined>) => async (sha: string) =>
    versions[sha]

describe("findVersionIntroducedAt", () => {
  it("dates a version bumped in the newest commit", async () => {
    const at = await findVersionIntroducedAt(
      commits,
      "0.3.3",
      reader({ d: "0.3.3", c: "0.3.2", b: "0.3.1", a: "0.3.0" }),
      true
    )
    expect(at).toBe("2026-09-09T00:00:00Z")
  })

  it("skips later commits that left the version alone", async () => {
    const at = await findVersionIntroducedAt(
      commits,
      "0.3.3",
      reader({ d: "0.3.3", c: "0.3.3", b: "0.3.3", a: "0.3.0" }),
      true
    )
    expect(at).toBe("2026-09-07T00:00:00Z")
  })

  it("dates a version that has been there since the file was created", async () => {
    const at = await findVersionIntroducedAt(
      commits,
      "0.1.0",
      reader({ d: "0.1.0", c: "0.1.0", b: "0.1.0", a: "0.1.0" }),
      true
    )
    expect(at).toBe("2026-09-01T00:00:00Z")
  })

  it("says nothing when the version predates the commits we looked at", async () => {
    const at = await findVersionIntroducedAt(
      commits,
      "0.1.0",
      reader({ d: "0.1.0", c: "0.1.0", b: "0.1.0", a: "0.1.0" }),
      false
    )
    expect(at).toBeUndefined()
  })

  it("treats a commit without a readable package.json as the version's start", async () => {
    const at = await findVersionIntroducedAt(
      commits,
      "0.1.0",
      reader({ d: "0.1.0", c: "0.1.0", b: undefined, a: undefined }),
      true
    )
    expect(at).toBe("2026-09-08T00:00:00Z")
  })

  it("says nothing when the newest commit already disagrees", async () => {
    const at = await findVersionIntroducedAt(
      commits,
      "9.9.9",
      reader({ d: "0.3.3", c: "0.3.2", b: "0.3.1", a: "0.3.0" }),
      true
    )
    expect(at).toBeUndefined()
  })

  it("says nothing when no commit touched the file", async () => {
    expect(
      await findVersionIntroducedAt([], "0.1.0", reader({}), true)
    ).toBeUndefined()
  })

  it("stops reading as soon as the version differs", async () => {
    const seen: string[] = []
    await findVersionIntroducedAt(
      commits,
      "0.3.3",
      async (sha) => {
        seen.push(sha)
        return sha === "d" ? "0.3.3" : "0.3.2"
      },
      true
    )
    expect(seen).toEqual(["d", "c"])
  })
})
