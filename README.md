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

1. **`registry/*.json`** is the only thing a human writes — a pointer at a repo (see
   [Submitting a plugin](#submitting-a-plugin)).
2. **`scripts/validate-registry.ts`** runs on every PR that touches registry inputs. It checks the
   entry is well-formed, the repo/path exists, and `paseo-plugin.json.id` matches the registry filename.
   CI detects affected paths and runs the website, companion-plugin, and Cafe service checks,
   then reports one aggregate `All checks passed` result. Checks cover formatting, lint, types,
   and tests, plus the website production build and a service deployment dry run. See
   `.github/workflows/ci.yml` and `.github/workflows/validate.yml`.
3. **`scripts/scan.ts`** ("plumb for paseo") generates data on demand before local development
   and production builds, then refreshes it during deployment on merges to `main` and nightly. It
   reads `paseo-plugin.json`, `package.json`, `README.md`, `LICENSE`, and `images/` straight from
   each plugin's repo, plus GitHub API metadata (stars, last commit, topics, license), and writes
   ignored, never-hand-edited records and public assets. See
   `.github/workflows/deploy-pages.yml`.
4. The build imports the generated `data/plugins.json` via `src/lib/plugins-data.ts`, prerenders
   every public page, and emits the directory API as the static `/api/plugins` asset.
5. **`.github/workflows/deploy-pages.yml`** refreshes and verifies the generated data and assets,
   builds `.output/public`, and publishes that artifact to GitHub Pages. The deployed site has no
   application server or runtime GitHub API access.
6. **`scripts/fetch-install-counts.ts`** fetches published Cafe service aggregates during Pages
   deployment. The static site renders `data/install-counts.json`; browsers never contact the
   reporting endpoint to display counts. Failed refreshes retain a dated, explicitly stale
   snapshot when available, otherwise counts remain unavailable rather than becoming zero.

## Submitting a plugin

The full walkthrough (with a prefilled "create this file on GitHub" button) lives on the site
itself at `/submit`. The short version — add one file, `registry/<your-plugin-id>.json`:

```jsonc
{
  "repo": "yourname/your-repo", // GitHub "owner/repo", not a full URL
  "path": "optional/subpath", // omit if your repo *is* the plugin
  "categories": ["productivity"], // free-form, refined over time
  "platforms": ["macos"], // only if platform-restricted — omit if it runs anywhere
  "caveats": ["Requires an OpenAI API key"], // short one-liners worth flagging, up to 6
  "submittedBy": "yourname"
}
```

Requirements, checked automatically by CI:

- The registry filename is a lowercase kebab-case plugin ID.
- Your repo (at `path`, if given) contains a valid `paseo-plugin.json` with the same `id`.

The plugin name comes from the registry filename after it is validated against the manifest ID. Description, version, license, screenshots,
stars, and the best-effort limitations excerpt are read from the plugin repository automatically.
A `README.md`, `LICENSE`, and an `images/` folder with screenshots all make a listing better; none
are required to get in.

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

## Cafe service

`services/cafe/` is a separately deployed Cloudflare Worker, managed with Wrangler. Its first
feature is install reporting from the Cafe plugin; it is not bundled into the plugin or the
GitHub Pages website. There is no author SDK. Install routes and storage stay separate from the
service entry point so unrelated service features can be added without changing this protocol.

- `GET /health`: service health without request metadata.
- `POST /v1/install`: exactly `{ "pluginId": "paseo-cafe", "nonce": "<operation UUID>" }`.
  Reporting is enabled by default; the host owner can opt out in the Cafe plugin settings. The
  plugin verifies a new default-catalog install before reporting. `204` accepts a report or retry,
  `400` rejects invalid input, `413` rejects oversized input, `429` throttles admission, and `503`
  means disabled or unavailable.
- `GET /v1/counts`: versioned public totals with `asOf` and `trackingSince`. Only completed UTC
  days are published. Tracking dates are day-rounded and withheld until the first publishable
  period. The response is edge-cached for five minutes and contains no report nonces.

The service stores daily aggregate counts and operation nonces with acceptance times for
48-hour retry deduplication. Alarms expire the nonces; daily totals remain. It does not store
IP addresses, machine IDs, inventories, paths, or free-form properties. Worker invocation logs
and dependency instrumentation are disabled, but Cloudflare still processes network metadata;
account-level retention settings must be reviewed separately.

Admission uses Cloudflare's approximate per-location rate limiter (600 requests/minute by
default), followed by transactional daily limits (10,000 globally and 1,000 per plugin). Invalid
and denied reports cannot add counter rows. A 512-byte body limit and five-second body deadline
bound parsing. These controls limit accepted volume, not all request charges, and cannot prove
that an anonymous client really installed a plugin. The UI labels totals as reported installs
via Cafe, not unique users; it does not use them to rank plugins.

### Development and validation

Install service dependencies from `services/cafe/` with `bun install --frozen-lockfile`, then run
`bun run service:dev` from the repository root. The development service listens on port 8787
with reporting enabled and local durable storage. Staging and production use separate Durable
Object and rate-limiter bindings, with reporting disabled by default.

From `services/cafe/`, run `bun run typecheck`, `bun run test`, and `bun run build`. The build
command bundles a production Worker with `wrangler deploy --dry-run`; it does not deploy.
`bun run catalog:build` regenerates the ignored allowlist from root `registry/*.json`. Regenerate
and deploy the service when registry entries change. Website and service releases can be
independent: an entry missing from a snapshot has no displayed count, not an invented zero.

From the root, `PASEO_CAFE_SERVICE_URL=http://127.0.0.1:8787 bun run counts:fetch` refreshes the
website snapshot from the local service. `counts:ensure` generates only a missing snapshot.
The default service origin is `https://api.paseo.cafe`; overrides require HTTPS or loopback HTTP.
Same-day local reports intentionally do not produce public totals until the next UTC day.

### Deployment

`.github/workflows/deploy-cafe-service.yml` is manual and runs only on `main`. Configure protected
GitHub environments `cafe-service-staging` and `cafe-service-production`, each with a scoped
`CLOUDFLARE_API_TOKEN` secret and `CLOUDFLARE_ACCOUNT_ID` variable. Production binds the custom
domain `api.paseo.cafe`, which must belong to that Cloudflare account; staging uses its
`workers.dev` URL. The workflow requires an explicit choice to enable install reporting.
Leaving it disabled is the ingestion kill switch; public historical totals remain available.

Pages deployment stays independent. Its optional `PASEO_CAFE_SERVICE_URL` repository variable
selects an alternate aggregate origin; no service credentials are exposed to the website or
plugin. Neither a Worker deployment nor SDK publishing is part of the plugin release workflow.

## Stack

TanStack Start (file-based routes under `src/routes/`), shadcn/ui (`src/components/ui/`,
base-ui-flavored — polymorphism uses `render`, not `asChild`), Tailwind v4, Zod for both the
registry schema (`src/lib/registry-schema.ts`) and the generated plugin schema
(`src/lib/plugin-schema.ts`).
