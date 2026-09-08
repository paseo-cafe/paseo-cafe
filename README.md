# paseo.cafe

A directory of community-built [Paseo](https://paseo.sh) plugins. Every listing is generated
from the plugin's own repo — authors don't fill out a form, they just point us at their code.

## How it works

```
registry/<id>.json      →  scripts/validate-registry.ts (CI, on PR)
                         →  scripts/scan.ts              (CI, on merge + nightly)
                         →  data/plugins/<id>.json + data/plugins.json
                         →  src/routes/plugins.*.tsx (reads data/plugins.json)
```

1. **`registry/*.json`** is the only thing a human writes — a pointer at a repo (see
   [Submitting a plugin](#submitting-a-plugin)).
2. **`scripts/validate-registry.ts`** runs on every PR that touches registry inputs. It checks the
   entry is well-formed, the repo/path exists, and a valid `paseo-plugin.json` manifest is there.
   Path-scoped CI separately checks app formatting, lint, types, tests, and the production build,
   plus formatting, lint, and types for the companion Paseo plugin. See
   `.github/workflows/app-ci.yml`, `.github/workflows/plugin-ci.yml`, and
   `.github/workflows/validate.yml`.
3. **`scripts/scan.ts`** ("plumb for paseo") runs on merge to `main` and nightly. It reads
   `paseo-plugin.json`, `package.json`, `README.md`, `LICENSE`, and `images/` straight from each
   plugin's repo, plus GitHub API metadata (stars, last commit, topics, license), and writes the
   generated, never-hand-edited records in `data/plugins/` and `data/plugins.json`. See
   `.github/workflows/enrich-and-deploy.yml`.
4. The site (`src/routes/plugins.index.tsx`, `src/routes/plugins.$id.tsx`) reads
   `data/plugins.json` via `src/lib/plugins-data.ts` — it never talks to GitHub directly.

5. **`.github/workflows/enrich-and-deploy.yml`** runs the scan, commits the refreshed `data/` +
   `public/og` + `public/sitemap.xml` + `public/robots.txt` back to `main`, then deploys to
   [Zerops](https://zerops.io) (`zerops.yaml`) — a persistent Bun server (via
   [Nitro](https://nitro.build), wired up in `vite.config.ts`), not a static export. That's also why
   `src/lib/plugins-data.ts` can just statically `import` `data/plugins.json` instead of reading it
   off disk at request time: it gets inlined into the server bundle at build time, and there's an
   actual long-running server to run that bundle on — no GitHub Pages-style static-hosting
   constraints to design around.

## Submitting a plugin

The full walkthrough (with a prefilled "create this file on GitHub" button) lives on the site
itself at `/submit`. The short version — add one file, `registry/<your-plugin-id>.json`:

```jsonc
{
  "id": "your-plugin-id", // must match the filename
  "repo": "yourname/your-repo", // GitHub "owner/repo", not a full URL
  "path": "optional/subpath", // omit if your repo *is* the plugin
  "categories": ["productivity"], // free-form, refined over time
  "platforms": ["macos"], // only if platform-restricted — omit if it runs anywhere
  "caveats": ["Requires an OpenAI API key"], // short one-liners worth flagging, up to 6
  "submittedBy": "yourname"
}
```

Requirements, checked automatically by CI:

- Your repo (at `path`, if given) contains a valid `paseo-plugin.json` with an `id`.
- `id` is unique across the registry and matches the filename.

Everything else — name, description, version, license, screenshots, stars, and even a
best-effort limitations excerpt (if your README has an "Install" or "Limitations" section) —
is read from your repo automatically. A `README.md`, `LICENSE`, and an `images/` folder with
screenshots all make your listing better; none are required to get in.

Open a PR adding your `registry/<id>.json`. Once Registry validation and CI pass, it's ready to merge.

## Local development

```bash
bun install
bun run registry:validate   # check registry/*.json against live GitHub repos
bun run registry:scan       # regenerate data/plugins/*.json + data/plugins.json
bun run dev                 # http://localhost:3000
```

Other useful scripts: `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`.

## Stack

TanStack Start (file-based routes under `src/routes/`), shadcn/ui (`src/components/ui/`,
base-ui-flavored — polymorphism uses `render`, not `asChild`), Tailwind v4, Zod for both the
registry schema (`src/lib/registry-schema.ts`) and the generated plugin schema
(`src/lib/plugin-schema.ts`).
