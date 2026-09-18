# paseo.cafe

A directory of community-built [Paseo](https://paseo.sh) plugins. Every listing is generated
from the plugin's own repo — authors don't fill out a form, they just point us at their code.

## How it works

```
registry/<id>.json      →  scripts/validate-registry.ts (CI, on PR)
                         →  scripts/scan.ts              (build, dev, deployment, nightly)
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
3. **`scripts/scan.ts`** ("plumb for paseo") generates data on demand before local development
   and production builds, then refreshes it during deployment on merges to `main` and every six
   hours. It reads plugin documentation and source metadata from GitHub. For npm-backed plugins it
   also resolves the exact npmjs version, publication date, integrity, and last-30-day downloads;
   GitHub stars and activity remain discovery signals only for Git-only plugins. Generated records
   and public assets are ignored and never hand-edited. See `.github/workflows/deploy-pages.yml`.
4. The build imports the generated `data/plugins.json` via `src/lib/plugins-data.ts`, prerenders
   every public page, and emits the catalog's machine interfaces: `/llms.txt`, `/llms-full.txt`,
   per-plugin Markdown at `/plugins/<id>.md`, OpenAPI at `/openapi.json`, the full JSON catalog at
   `/api/plugins`, and focused JSON records at `/api/plugin/<id>.json`.
5. **`.github/workflows/deploy-pages.yml`** refreshes and verifies the generated data and assets,
   builds `.output/public`, and publishes that artifact to GitHub Pages. The deployed site has no
   application server or runtime GitHub API access.

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

The full walkthrough (with a prefilled "create this file on GitHub" button) lives on the site
itself at `/submit`. The short version — add one file, `registry/<your-plugin-id>.json`:

```jsonc
{
  "repo": "yourname/your-repo", // GitHub "owner/repo", not a full URL
  "path": "optional/subpath", // omit if your repo *is* the plugin
  "package": "@yourname/paseo-plugin", // optional; npmjs only, no version or tag
  "categories": ["productivity"], // free-form, refined over time
  "platforms": ["macos"], // only if platform-restricted — omit if it runs anywhere
  "caveats": ["Requires an OpenAI API key"], // short one-liners worth flagging, up to 6
  "submittedBy": "yourname"
}
```

Requirements, checked automatically by CI:

- The registry filename is a lowercase kebab-case plugin ID.
- `path`, when present, is at most 500 characters and uses the shared safe repository-path
  validation applied by both the site and companion plugin.
- Your repo (at `path`, if given) contains a valid `paseo-plugin.json` with the same `id`.
- `package`, when present, is a public npmjs package name with no version, tag, URL, or registry.
- Paseo 0.9 installs declared packages from npm; Paseo 0.8 retains the GitHub source.
- Install commands always use the scanner-derived exact npm version or Git commit; mutable tags and
  branches are never handed to an install or update action.

The plugin name comes from the registry filename after it is validated against the manifest ID.
Description, version, license, screenshots, and the best-effort limitations excerpt are read
automatically. npm-backed plugins show and rank by last-30-day downloads and exact-version publish
date; Git-only plugins retain their existing star and catalog-listing ordering. When `package` is
present, its current published version is the catalog version and must match the Git source. A
`README.md`, `LICENSE`, and an `images/` folder in the repository all make a listing better; none
are required to get in.

Paseo Cafe uses the published npm version when `package` is declared and otherwise uses the Git
plugin directory's `package.json.version`. Start at a real semantic version such as `0.1.0`, not
the `0.0.0` placeholder, and increment it whenever you publish a plugin update. Missing or invalid
versions remain browsable and installable but report their version as unavailable. The scanner
flags `0.0.0`, because updates cannot be detected until the maintainer starts incrementing it.


Open a PR adding your `registry/<id>.json`. Once Registry validation and CI pass, it's ready to merge.

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
