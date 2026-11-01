# paseo.cafe

A directory of community-built [Paseo](https://paseo.sh) plugins. Every listing is generated
from the plugin's own repo — authors don't fill out a form, they just point us at their code.

> **Deprecated.** paseo.cafe has been superseded by the official Paseo plugin registry
> (https://paseo.sh/plugins, data at https://plugins.paseo.sh, protocol at
> https://github.com/getpaseo/plugins/blob/main/PROTOCOL.md). New submissions are not accepted here;
> use the [official form](https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml).
> The catalog is frozen and the JSON API at `/api/plugins` stops on 2026-12-01. The companion plugin
> in `plugin/` keeps working and already reads the official registry.

## How it works

```
registry/<id>.json      →  scripts/validate-registry.ts (CI, on PR)
                         →  scripts/scan-plan.ts         (pinned incremental plan)
                         →  targeted security + enrichment scans
                         →  ignored data/plugins/*.json + public assets
                         →  Nitro prerender              (.output/public)
```

1. **`registry/*.json`** is the only thing a human writes — a GitHub source plus an optional public
   npmjs package (see [Submitting a plugin](#submitting-a-plugin)).
2. **`scripts/validate-registry.ts`** runs on every PR that touches registry inputs. It checks the
   entry is well-formed, the repo/path exists, `paseo-plugin.json.id` matches the registry filename,
   and any declared npm package publishes the same ID and version.
   CI detects affected paths, runs the app and/or companion-plugin checks, then reports one
   aggregate `All checks passed` result. App checks cover formatting, lint, types, tests, and the
   production build; plugin checks cover formatting, lint, types, and tests. See
   `.github/workflows/ci.yml` and `.github/workflows/validate.yml`.
3. **`scripts/scan-plan.ts`** resolves each repository head and npm dist-tag once, compares those
   pinned identities with the last successfully deployed scan state, and selects only new plugin
   releases. Git repositories use each plugin path's normalized `package.json.version` as the
   change detector, so unrelated monorepo commits do not move the published plugin commit. npm
   releases use their exact package, version, and SHA-512 integrity. `scripts/scan.ts` enriches only
   promoted candidates and retains the complete prior record when a candidate fails. A lightweight
   npm-only check runs every 15 minutes; Git release checks continue every six hours. Unchanged
   scheduled runs stop after planning. Missing or invalid prior state safely causes a full scan.
4. The build imports the generated `data/plugins.json` via `src/lib/plugins-data.ts`, prerenders
   every public page, and emits the catalog's machine interfaces: `/llms.txt`, `/llms-full.txt`,
   per-plugin Markdown at `/plugins/<id>.md`, OpenAPI at `/openapi.json`, the full JSON catalog at
   `/api/plugins`, and focused JSON records at `/api/plugin/<id>.json`.
5. **`.github/workflows/deploy-pages.yml`** restores scan state produced only after a successful
   Pages deployment, builds and verifies the static site when the plan changes, publishes it, and
   then records the matching state for the next run. The deployed site has no application server
   or runtime GitHub API access.

## Agent and API access

All machine-readable outputs are generated from the same scanned plugin records as the website, so
new and updated registry entries require no additional documentation work. Start with
[`/llms.txt`](https://paseo.cafe/llms.txt) for the compact index or
[`/openapi.json`](https://paseo.cafe/openapi.json) for the JSON API contract.
`/llms-full.txt` contains bounded, catalog-generated facts for bulk ingestion. Repository-provided
README text appears only in the individual Markdown listing, after an explicit trust boundary.


Because production is a static GitHub Pages deployment, canonical plugin pages cannot negotiate on
the HTTP `Accept` header. Each HTML plugin page advertises an explicit `text/markdown` alternate at
`/plugins/<id>.md`; explicit URLs work consistently for agents and ordinary HTTP clients.

## Running your own copy

Fork it, turn on GitHub Pages (Settings → Pages → Source: **GitHub Actions**), then run the
**Enrich and deploy to GitHub Pages** workflow. Nothing needs editing: the workflow asks
`actions/configure-pages` where the deployment lives and passes that to the scan and the build, so
a fork publishes correct links, canonical URLs and a sitemap for its own
`https://<owner>.github.io/<repo>/` — while the canonical site, which has a custom domain, keeps
serving from the root. See `VITE_SITE_URL`/`VITE_BASE_PATH` in `src/lib/site.ts`.

## Submitting a plugin

Submissions here are closed. Submit to the
[official Paseo plugin registry](https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml);
Git-only plugins are accepted and npm is optional. Existing `registry/<id>.json` entries can still be
edited or removed by PR until the catalog sunsets.

## Local development

```bash
bun install
bun run registry:validate   # check registry/*.json against live GitHub repos
bun run dev                 # regenerate the listing, then serve http://localhost:3000
```

`bun run build` ensures the generated listing exists before producing the static site in
`.output/public`. Run `bun run registry:scan` explicitly to refresh it. Other useful scripts:
`bun run typecheck`, `bun run lint`, `bun run test`.

## Stack

TanStack Start (file-based routes under `src/routes/`), shadcn/ui (`src/components/ui/`,
base-ui-flavored — polymorphism uses `render`, not `asChild`), Tailwind v4, Zod for both the
registry schema (`src/lib/registry-schema.ts`) and the generated plugin schema
(`src/lib/plugin-schema.ts`).
