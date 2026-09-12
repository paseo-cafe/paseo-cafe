# Agent Instructions

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Keep the plugin aligned with the website

This repo ships two consumers of the same plugin catalog: the **website**
(`src/`, TanStack Start + React DOM + Tailwind, deployed as paseo.cafe) and
the **companion plugin** (`plugin/`, React Native, runs natively inside the
Paseo app). They cannot share components — the Paseo v0.8 plugin SDK
whitelists exactly nine client-side module specifiers and none of them is a
WebView/iframe/DOM primitive, so the plugin can never literally embed or
render the live website. That's confirmed against the deployed SDK docs and
this monorepo's own `shared-browser` companion plugin (which "shows a live
page" only by screencasting a headless Chromium session over RPC — a ~180MB,
remote-desktop-grade workaround, not a lightweight embed). Treat that as
settled; don't re-litigate it without new SDK evidence.

Because the two can't share JSX, **any change to one must be checked against
the other by hand**:

1. **Shared catalog logic** (category taxonomy/labels, install-command
   formatting, health-check semantics/labels, and anything else both sides
   must agree on) lives in `plugin/shared/catalog.ts` — a single,
   dependency-free module (no React, no Paseo SDK, no Zod, no DOM, no Node)
   imported directly by both `src/lib/*` (website) and
   `plugin/shared/directory.ts` (plugin). Add new shared rules there once;
   never hand-copy or re-derive the same rule on one side and mirror it "by
   hand" on the other — that drifts silently (it already had: the plugin's
   `manifestValid` health label said something different from what the
   check actually verifies until this was unified).
2. **Visual language.** The website's design system — JetBrains Mono
   monospace everywhere (`src/styles.css`), `rounded-none` flat-bordered
   controls and badges (`src/components/ui/{button,badge,card}.tsx`),
   uppercase tracked section labels — is the canonical brand identity.
   Changing the website's fonts, radii, spacing scale, or color roles
   without a matching pass over the plugin's React Native surfaces
   (`plugin/client/DirectorySurface.tsx`, `PluginRow.tsx`,
   `PluginDetailPage.tsx`, `PluginGalleryPage.tsx`, using the shared tokens
   in `plugin/client/visual.ts` plus Paseo's `theme.colors`/
   `layout.compact`) leaves the plugin visually stale. Do the matching pass
   in the same change.
   The brand mark is the same story with one twist: its geometry lives in
   `src/lib/brand-mark.ts` (website + scripts), and `bun run icons:build`
   generates every derived asset from it — `public/favicon.*`,
   `public/apple-touch-icon.png`, and `plugin/shared/brand-mark.ts` (a
   tintable PNG data URI, since the plugin cannot render SVG). Edit the
   module, run the script, commit the outputs; never hand-edit a generated
   file.
3. **Root `tsconfig.json` excludes `plugin/`** from the website's own
   project only so `bun run typecheck` doesn't try to bulk-check the whole
   React Native tree (wrong `lib`, unresolved RN-only modules). Importing a
   single dependency-free file from `plugin/shared/` into `src/lib/` (as
   `registry-schema.ts`, `install-command.ts`, and `plugins.$id.tsx` already
   do) is expected and fine — keep any such shared module free of anything
   that would make it fail to typecheck under the website's DOM-ful config.

4. **Plugin release identity.** The catalog and companion plugin use each plugin's
   `package.json.version` as its update identity. Registry submissions must use a real semantic
   version rather than `0.0.0`, and every released plugin change must increment it. Keep this
   contract visible in submitter-facing guidance and templates; the registry scanner must flag
   placeholder versions.

   Release Please owns the companion plugin's version bumps. Feature and fix PRs must not edit
   `plugin/package.json`, `plugin/package-lock.json`, `.release-please-manifest.json`, or
   `plugin/CHANGELOG.md` solely to advance the release version; the generated release PR updates
   those files together.

**Validate both sides before calling catalog/plugin work done:**
```bash
bun run check                                  # website: biome + tsc
(cd plugin && npm run typecheck && npm test)   # plugin: tsc + vitest
```

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->

<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
