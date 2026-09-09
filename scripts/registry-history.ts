/**
 * "When did the directory gain this plugin?", answered from this repo's own
 * git history: registry/<id>.json is added in exactly one commit and never
 * backdated, so the commit that added it is the plugin's arrival date. Used by
 * scripts/scan.ts to stamp each generated record with `addedAt`, which the
 * site compares against the visitor's locally stored last visit.
 */
import { execFileSync } from "node:child_process"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T[\d:]{8}(?:Z|[+-]\d{2}:\d{2})$/
const REGISTRY_FILE = /^registry\/(.+)\.json$/

/**
 * Parses `git log --diff-filter=A --reverse --format=%cI --name-only`
 * output into registry id → ISO date of the commit that added it. Oldest
 * commit first, so the first sighting of a file wins.
 */
export function parseAddedDates(gitLog: string): Map<string, string> {
  const added = new Map<string, string>()
  let commitDate: string | null = null

  for (const line of gitLog.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (ISO_DATE.test(trimmed)) {
      commitDate = new Date(trimmed).toISOString()
      continue
    }
    const match = REGISTRY_FILE.exec(trimmed)
    if (!match || !commitDate) continue
    if (!added.has(match[1])) added.set(match[1], commitDate)
  }

  return added
}

/**
 * Reads the arrival date of every registry entry. Returns an empty map rather
 * than guessing when the history isn't trustworthy — a shallow clone reports
 * every file as added in its graft commit, which would date the whole catalog
 * to the checkout and flag every plugin as new for every visitor.
 */
export function readRegistryAddedDates(cwd: string): Map<string, string> {
  try {
    const shallow = execFileSync(
      "git",
      ["rev-parse", "--is-shallow-repository"],
      { cwd, encoding: "utf8" }
    ).trim()
    if (shallow !== "false") {
      console.warn(
        "  ! shallow git clone — skipping addedAt (deploy needs fetch-depth: 0)"
      )
      return new Map()
    }

    const log = execFileSync(
      "git",
      [
        "log",
        "--diff-filter=A",
        // A renamed registry entry is a new listing as far as the site is
        // concerned; without this, rename detection hides it from --diff-filter=A.
        "--no-renames",
        "--reverse",
        "--format=%cI",
        "--name-only",
        "--",
        "registry",
      ],
      { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    )
    return parseAddedDates(log)
  } catch (err) {
    console.warn(
      `  ! could not read registry history from git (${(err as Error).message}) — records will have no addedAt`
    )
    return new Map()
  }
}
