---
name: paseo-version-support
description: Use when a new Paseo release (stable or beta) ships and the plugins we own must support it. Covers finding the currently supported version, reviewing every Paseo commit since it, writing an impact digest, opening one broad "support Paseo X.Y" PR per repo (paseo-cafe/paseo-cafe and omercnet/paseo-plugins), then one stacked PR per plugin that adopts relevant new features, migrates deprecated APIs and optimizes for the new version. Trigger on "Paseo has a new version", "support Paseo 0.N", "bump the Paseo SDK", or "review what changed in Paseo".
---

# paseo-version-support

Repeatable process for rolling every plugin we own onto a new Paseo release. It was done by hand for 0.8, 0.9, 0.10, 0.11, 0.12 and 0.13; this file is what those runs converged on. Evidence of the past runs is in `git log`, and each step below says where the precedent lives.

"Our plugins" are:

- the 13 plugins in `omercnet/paseo-plugins` (local clone `~/paseo-plugins`; workspaces listed in its root `package.json`),
- the companion plugin in this repo, `plugin/` (Paseo Cafe).

Third-party plugins in `registry/*.json` are not ours. For them the only work is keeping the admission scanner and catalog correct (step 3).

## Hard rules

- The default Paseo daemon and `~/.paseo` are production state. Every runtime check uses an isolated daemon (`deliver` skill helper in `~/paseo-plugins/.agents/skills/deliver/scripts/dev-daemon.sh`, explicit `--host`/`--home`). `paseo-omp` follows its own `paseo-omp/AGENTS.md` flow.
- Never edit versions, changelogs, `.release-please-manifest.json` or `release-please-config.json` (release-please owns them in both repos). In this repo that includes `plugin/package.json` `version`, `plugin/package-lock.json` version fields and `plugin/CHANGELOG.md`.
- Conventional Commits for commits and PR titles. `paseo-plugins` scopes by plugin directory (`fix(top)!: ...`); a cross-plugin PR has no scope. No em dashes anywhere. Repos are public: no secrets, hostnames, private paths.
- Never `--admin` merge, never bypass branch protection. Open PRs, report blockers.
- Use `ponytail`: smallest diff that delivers a concrete benefit. Do not adopt a feature because it exists.
- `/tmp` can be a full tmpfs shared with other sessions. `export TMPDIR=$HOME/.cache/<run>/tmp` before running the dev daemon, and never delete `/tmp` content you did not create.
- `bun run check` in this repo runs a GitHub-scraping scan (about 4 minutes, rate limited). While iterating use `bunx biome check --error-on-warnings .` and `bunx tsc --noEmit`, or `bun run check:plugin` for `plugin/`.

## 0. Check that nobody else is already doing this

A rollout is cheap to start from two sessions at once and expensive to reconcile (0.13 ran twice in parallel, ten minutes apart, same GitHub account). Before touching anything:

```sh
gh pr list -R omercnet/paseo-plugins --state open --limit 40 --json number,title,headRefName,createdAt
gh pr list -R paseo-cafe/paseo-cafe  --state open --limit 40 --json number,title,headRefName,createdAt
git -C ~/paseo-plugins worktree list; ls ~/wt 2>/dev/null
gh pr list -R omercnet/paseo-plugins --search "paseo sdk OR Paseo 0." --state all --limit 10
```

An open "update paseo sdk" / "support Paseo X" PR, a `chore/paseo-*` branch, or fresh uncommitted worktrees under `~/wt` mean a run is in flight. Join it or ask the user which run owns each repo; never open a second broad PR for the same version. Hold per-plugin workers' pushes until that is settled (tell them "commit locally, do not push").

## 1. Find the current and the new version

Current support is whatever these say; they must agree, and any disagreement is itself a finding:

| Where | What |
| --- | --- |
| `plugin/package.json` | `devDependencies["@getpaseo/plugin"]` |
| `plugin/paseo-plugin.json` | `requirements.paseo` of the companion plugin |
| `.github/workflows/ci.yml` | `paseo_version` matrix of the "Plugin" job |
| `~/paseo-plugins/package.json` | `catalog["@getpaseo/*"]` (cli, client, plugin, protocol, server) |
| `~/paseo-plugins/*/paseo-plugin.json` | each plugin's `requirements.paseo` |
| plugin READMEs | prose that quotes a range or "Paseo 0.N" |
| `scripts/plugin-security/static-scan.ts` | manifest keys the admission scan allows per Paseo version |

New version:

```sh
npm view @getpaseo/plugin dist-tags          # latest (stable) and beta
npm view @getpaseo/plugin versions --json | tail -12
gh release list -R getpaseo/paseo --limit 12
for p in cli client plugin protocol server; do npm view @getpaseo/$p@<ver> version; done   # all five must exist
```

Target the newest tag that has all five packages published, including a beta when the beta is ahead of stable. Precedent: 0.10.0-beta.1, 0.11.0-beta.3/4 and 0.12.0-beta.2 were adopted before their stable releases, and the stable bump came later as a one-line follow-up. If the newest version is a prerelease, say so in PR text.

## 2. Review every commit and write the digest

Paseo source: `~/dev/paseo` (a clone of getpaseo/paseo; run `git fetch --tags` first).

```sh
cd ~/dev/paseo
git rev-list --count v<old>..v<new>
git log --format='%h %s' v<old>..v<new> --no-merges          # classify EVERY commit
git --no-pager diff --no-color --stat=160 v<old>..v<new> | cat | grep -v 'packages/app/\|website\|locales'
```

Tooling gotcha: bare `git diff` output may be summarized or elided by the harness. Always `git --no-pager diff --no-color ... | cat > ~/.cache/<run>/x.diff` and read the file.

Read in full, not by title:

- `packages/plugin/src/**` (SDK contracts: `client/contracts.ts`, `client/ui.ts`, `client/react-native.ts`, `contracts.ts`, `server/lifecycle.ts`, `index.ts`, new modules). Compare exported names between tags; removed exports and newly required props are the breaking ones.
- `packages/server/src/server/plugins/**` (manifest schema, compiler, lifecycle, icon rules, SDK specifiers).
- `packages/protocol/src/{plugin-registry,plugin-requirements,messages,agent-labels,addresses,client-capabilities}.ts` and `packages/client/src/index.ts` (what `paseo.*` returns and accepts).
- `CHANGELOG.md` sections for every release in range (`### Plugins` is the author-facing summary but is not complete), `docs/plugins.md`, `docs/agent-lifecycle.md`, `docs/protocol-compatibility.md`, `public-docs/plugins/reference.md`.
- Every `COMPAT(...)` comment added in the range: it names the removal date of a deprecated path.

Classify each commit as: plugin SDK break, plugin SDK addition, deprecation, daemon behavior change visible to plugins, protocol/client API, user-visible app change that obsoletes a plugin workaround or README limitation, or irrelevant. Write the result as a digest (one file) that is detailed enough to hand to a worker that has not seen Paseo: names of exports, signatures verified against source, removal dates, the Paseo PR number per item, and what needs the new version at runtime. Verify every claim you put in it against the source; a wrong digest propagates to every PR.

Facts that have mattered before:

- The daemon checks `requirements.paseo` against the version and against its stable core, so `^0.N.0` admits `0.N.0-beta.k` (`packages/protocol/src/plugin-requirements.ts`). Other tooling (npm semver, the cafe scanner's `rangeRequiresAtLeast`) does not, so a prerelease-aware comparator may still be needed there.
- Manifest keys: the daemon schema is non-strict for top-level keys (unknown keys are stripped) but strict for `requirements`. The cafe scanner is stricter on purpose (see step 3).
- A removed SDK export fails at bundle or run time, not always at typecheck. grep plugin source for every removed name.

## 3. Broad PR in each repo

One PR per repo, titled `chore: support Paseo X.Y` (cafe) / `fix: support Paseo X.Y` (paseo-plugins: the widened range must ship in a release, and `fix` triggers one). Land these first; everything else stacks on them.

### paseo-cafe/paseo-cafe

Precedents: `f4091c6` (0.12), `d0f6bb0` (0.11), `28e01f9` (scanner, 0.11), `6228b48` (0.10), `c0a6f06` (0.8).

1. `plugin/package.json` devDependency `@getpaseo/plugin` to the new version; `cd plugin && npm install`; check the lockfile diff only adds the SDK and its new transitive deps.
2. `.github/workflows/ci.yml`: Plugin job matrix `paseo_version` keeps the oldest supported version and adds the new one (and the newest stable if different).
3. `plugin/paseo-plugin.json` range: leave it open-ended (`>=0.11.0-beta.4`) unless the plugin gains a 0.N-only API; if it must change, update `plugin/README.md` which quotes it.
4. Admission scanner (`scripts/plugin-security/static-scan.ts`, rule text in `scan.ts`, tests in `static-scan.test.ts`): if the new daemon added optional top-level manifest keys, allow them when `requirements.paseo` requires the version that introduced them (`rangeRequiresAtLeast`), validate their shape like Paseo does, keep older ranges reporting them as unknown, and add the rule's `issue`/`fix` text. 0.9 added `description`, 0.11 `name`/`icon`/`media`, 0.13 `translations`. Also re-check how the scan treats new SDK specifiers (`plugin-sdk-specifiers.ts` in Paseo) and new reachable file types.
5. Check the catalog model and website for fields that mirror the registry protocol (`PublishedPluginSchema` additions) before assuming nothing changed.
6. Validate: `(cd plugin && npm run typecheck && npm test)`, `bunx vitest run scripts/plugin-security`, `bunx biome check --error-on-warnings .`, `bunx tsc --noEmit`.

### omercnet/paseo-plugins

Precedents: `7674f19` (#357, 0.12.0), `7dbbe2a` (#342, 0.12 beta), `a46fe9e` (#286, require 0.11).

1. Root `package.json` `catalog`: the five `@getpaseo/*` versions; `bun install`; regenerate shrinkwraps (`node scripts/shrinkwrap.mjs <plugin>` for plugins that ship `npm-shrinkwrap.json`; `npm run check` fails on drift).
2. Run `npm run typecheck` and `npm test` in every plugin workspace (parallel loop, 25 seconds total). Fix breakage the new SDK causes, minimally. 0.13 example: `PluginWorkspacePanelProps` gained required `params`, `revision`, `tab`, which broke a plugin that used the type for inner components that only read host chrome.
3. Widen `requirements.paseo` of every plugin that passed, appending `|| ^X.Y.0` and keeping older lines it already supported; update the README sentences that quote the range. Leave a plugin at its old range when its own runtime check is deferred (paseo-omp uses its own dev-daemon flow), and say so in the PR.
4. Runtime smoke per plugin: `S=.agents/skills/deliver/scripts/dev-daemon.sh; $S up <plugin>; $S cli <plugin> plugin ls` must show `running` with an empty ERROR column; then `$S down <plugin>`. `up` fails before the range is widened, which proves the range is what blocked users.
5. Do not touch the nightly `paseo-latest.yml` lanes unless they broke: its `beta` channel already tracks the new release and opens one rolling issue per lane.

PR body: problem, change, what is deliberately unchanged, verification table with commands and results, and the stack plan for the follow-ups.

## 4. Per-plugin PRs

One PR per plugin that has a concrete reason to change, stacked on the broad branch (`gh pr create --base <broad-branch>`; GitHub retargets to `main` when the broad PR merges). No PR for a plugin that needs nothing; its assessment goes in the final report.

Run them as parallel workers (`task` tool, one per plugin, one batch) with a shared `context` containing the digest path, the constraints from "Hard rules", the stacking recipe, and the report format. Each worker gets plugin-specific grep hints from the impact survey:

```sh
cd ~/paseo-plugins
for pat in 'client/react-native' 'useRevealedText' 'SettingsGroup' 'addWorkspacePanel' 'addAgentPanel' 'turn_ended' \
  'paseo.parent-agent-id\|callerAgentId\|parent:' 'sourceAgentId' 'addTimelineTransformer' 'addHeaderButton\|addComposerPill' \
  'registerProvider\|registerUsageSource' 'agents.list\|subscribe:'; do
  echo "### $pat"; grep -rIln -e "$pat" --include=*.ts --include=*.tsx --exclude-dir=node_modules . | cut -d/ -f2 | sort | uniq -c
done
```

(Adapt the pattern list to what the digest says changed.)

Worker recipe:

1. `git worktree add -b <type>/<plugin>-paseo-X.Y ~/.paseo/worktrees/<id>/pp/<plugin>-X.Y origin/<broad-branch>`; `bun install`; revert incidental `bun.lock` edits.
2. Assess every digest item against the plugin's source and README. Record `{item, relevant, evidence, action}`.
3. Implement only items with a concrete payoff: removed API in use (mandatory), deprecated API in use (migrate; deprecations have removal dates), README-documented limitation the release solves, workaround the release makes obsolete, correctness issue (for example cross-host agent identity, or code reading the now always-empty `agent.turn_ended` `timeline`), measurable cost. Skip i18n unless the plugin already localizes strings.
4. Floor policy is a product decision, not a worker decision. Migrating `client/react-native` to `client/ui` (and `context` to `addAgentPanel`) gains nothing functionally and forces a `^X.Y.0` floor that strands older-Paseo users; both the deprecation shims and the old entry points live until a dated removal. Default: do not drop a supported line for a pure deprecation migration; do it in one sweep when the older line is dropped and before the removal date. Adopt a new-only API when the plugin gets a concrete user-visible benefit (for example per-tab persisted state, host `Markdown`), and then raise the floor. Ask the user when the choice is not obvious. Range policy: keep `^old || ^new` when the change works on both. A change that needs a new-only API sets `requirements.paseo` to `^X.Y.0` and is a breaking commit (`feat!`/`fix!` with a `BREAKING CHANGE:` footer); older-Paseo users stay on the previous release. Weigh this hardest for plugins whose job is installing other plugins (the cafe plugin).
5. Verify in the plugin dir: `npm run check`, `npm run typecheck`, `npm test` (and `verify:package` if defined), then a live check on an isolated daemon of the new version, exercising the changed path (UI changes: headless browser via `xd://browser` against `http://$DEV_HOST/`). State plainly what could not be exercised.
6. PR: problem with Paseo PR numbers, change, out of scope/follow-ups, verification table, and the stack note.

Workers misreport. In 0.13 one worker claimed a manifest was not widened when it was; another reported a stale branch state. Check claims against the pushed branch (`git show origin/<branch>:<path>`) before acting on them. Review every worker result yourself before reporting: open the PR, read the diff, confirm the range, scope, no version/changelog edits, tests that discriminate, and that CI is queued. Do not claim an unobserved verification.

## 5. Report

Per repo and per plugin: current version, new version, which Paseo changes mattered (with PR numbers), PR links with base branches, verification actually run, what was deliberately skipped and why, and the follow-ups left (for 0.13: runtime translations, file panels, `Markdown` host component where relevant). Close with the removal dates of deprecated APIs still in use, because those are the next deadline.

## Maintaining this skill

After each run, add the new version's category of break to "Facts that have mattered before" and the scanner key list in step 3, and fix any step that was wrong. Keep the plugin count and paths in the intro accurate.
