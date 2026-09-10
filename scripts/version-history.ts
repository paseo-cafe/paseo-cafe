/**
 * "When did this plugin last change version?", answered from the plugin's own
 * repo rather than from any state we keep: walk the commits that touched its
 * package.json, newest first, reading the version at each one, and the last
 * commit still carrying the current version is the one that introduced it.
 *
 * Reading the file at each commit (rather than parsing commit patches) keeps
 * this exact for monorepo plugins, initial commits, and reverts, and costs one
 * API call plus a handful of raw-content fetches — a plugin that bumps its
 * version on release usually resolves in one or two.
 */
import { fetchRawJson, ghApi } from "./github.ts"

/** Commits are paged; beyond this we can't tell "unchanged for ages" from "unchanged forever" cheaply, so we say nothing. */
const MAX_COMMITS = 100

interface CommitListEntry {
  sha: string
  commit: { committer: { date: string } | null }
}

export interface VersionCommit {
  sha: string
  date: string
}

/**
 * Finds the commit that set `currentVersion`, given commits touching the
 * plugin's package.json newest-first and a way to read the version at a
 * commit. `reachedFirstCommit` says whether `commits` runs all the way back to
 * the file's creation — without that, a version unchanged across the whole
 * page is unknowable rather than "introduced at the oldest commit we looked at".
 */
export async function findVersionIntroducedAt(
  commits: VersionCommit[],
  currentVersion: string,
  readVersionAt: (sha: string) => Promise<string | undefined>,
  reachedFirstCommit: boolean
): Promise<string | undefined> {
  let introduced: VersionCommit | undefined

  for (const commit of commits) {
    // A missing/unparseable package.json counts as "different" — that's the
    // commit before the plugin had this version, including its very first.
    if ((await readVersionAt(commit.sha)) !== currentVersion) {
      return introduced?.date
    }
    introduced = commit
  }

  return reachedFirstCommit ? introduced?.date : undefined
}

/** Network wrapper around findVersionIntroducedAt. Best-effort: any failure means no date, never a failed scan. */
export async function fetchVersionUpdatedAt(
  owner: string,
  repo: string,
  packageJsonPath: string,
  currentVersion: string
): Promise<string | undefined> {
  try {
    const listed = await ghApi<CommitListEntry[]>(
      `/repos/${owner}/${repo}/commits?path=${encodeURIComponent(packageJsonPath)}&per_page=${MAX_COMMITS}`
    )
    const commits = listed.flatMap((entry) =>
      entry.commit.committer
        ? [{ sha: entry.sha, date: entry.commit.committer.date }]
        : []
    )

    return await findVersionIntroducedAt(
      commits,
      currentVersion,
      async (sha) => {
        const pkg = await fetchRawJson<{ version?: unknown }>(
          owner,
          repo,
          sha,
          packageJsonPath
        )
        return typeof pkg?.version === "string" ? pkg.version : undefined
      },
      listed.length < MAX_COMMITS
    )
  } catch (err) {
    console.warn(
      `  ! could not date version ${currentVersion} from history: ${(err as Error).message}`
    )
    return undefined
  }
}
