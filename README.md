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

The catalog is frozen. `data/plugins.json` is the last deployed scan (2026-10-23) and is committed;
nothing scans `registry/*.json` any more, so editing those files changes nothing. The build imports
`data/plugins.json` via `src/lib/plugins-data.ts`, prerenders every public page, and emits the
catalog's machine interfaces: `/llms.txt`, `/llms-full.txt`, per-plugin Markdown at
`/plugins/<id>.md`, OpenAPI at `/openapi.json`, the full JSON catalog at `/api/plugins`, and focused
JSON records at `/api/plugin/<id>.json`.

Listing pages (`/plugins/<id>`), `/submit`, and `/user/<login>` redirect to paseo.sh.
`data/registry-migration.json` maps each cafe id to its official `owner/slug`; ids without one go to
https://paseo.sh/plugins. `/api/plugins` stays a plain 200 response until sunset, because older
companion plugins fetch it with redirects disabled.

`.github/workflows/deploy-pages.yml` rebuilds and publishes the site after CI passes on `main`.

## Agent and API access

All machine-readable outputs are generated from the same frozen plugin records as the website. Start with
[`/llms.txt`](https://paseo.cafe/llms.txt) for the compact index or
[`/openapi.json`](https://paseo.cafe/openapi.json) for the JSON API contract.
`/llms-full.txt` contains bounded, catalog-generated facts for bulk ingestion. Repository-provided
README text appears only in the individual Markdown listing, after an explicit trust boundary.


Because production is a static GitHub Pages deployment, canonical plugin pages cannot negotiate on
the HTTP `Accept` header. Each HTML plugin page advertises an explicit `text/markdown` alternate at
`/plugins/<id>.md`; explicit URLs work consistently for agents and ordinary HTTP clients.

## Running your own copy

Fork it, turn on GitHub Pages (Settings → Pages → Source: **GitHub Actions**), then run the
**Deploy to GitHub Pages** workflow. Nothing needs editing: the workflow asks
`actions/configure-pages` where the deployment lives and passes that to the build, so
a fork publishes correct links, canonical URLs and a sitemap for its own
`https://<owner>.github.io/<repo>/` — while the canonical site, which has a custom domain, keeps
serving from the root. See `VITE_SITE_URL`/`VITE_BASE_PATH` in `src/lib/site.ts`.

## Submitting a plugin

Submissions here are closed. Submit to the
[official Paseo plugin registry](https://github.com/getpaseo/plugins/issues/new?template=submit-plugin.yml);
Git-only plugins are accepted and npm is optional.

## Local development

```bash
bun install
bun run dev                 # serve http://localhost:3000
```

`bun run build` produces the static site in `.output/public`. Other useful scripts:
`bun run typecheck`, `bun run lint`, `bun run test`.

## Stack

TanStack Start (file-based routes under `src/routes/`), shadcn/ui (`src/components/ui/`,
base-ui-flavored — polymorphism uses `render`, not `asChild`), Tailwind v4, Zod for both the
registry schema (`src/lib/registry-schema.ts`) and the generated plugin schema
(`src/lib/plugin-schema.ts`).
