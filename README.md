# paseo.cafe

A directory of community-built [Paseo](https://paseo.sh) plugins. Every listing is generated
from the plugin's own repo — authors don't fill out a form, they just point us at their code.

## How it works

```
registry/<id>.json      →  scripts/validate-registry.ts (CI, on PR)
                         →  scripts/scan.ts              (build, dev, deployment, nightly)
                         →  ignored data/plugins/*.json + public assets
                         →  src/routes/plugins.*.tsx (build imports data/plugins.json)
```

1. **`registry/*.json`** is the only thing a human writes — a pointer at a repo (see
   [Submitting a plugin](#submitting-a-plugin)).
2. **`scripts/validate-registry.ts`** runs on every PR that touches registry inputs. It checks the
   entry is well-formed, the repo/path exists, and `paseo-plugin.json.id` matches the registry filename.
   CI detects affected paths, runs the app and/or companion-plugin checks, then reports one
   aggregate `All checks passed` result. App checks cover formatting, lint, types, tests, and the
   production build; plugin checks cover formatting, lint, and types. See
   `.github/workflows/ci.yml` and `.github/workflows/validate.yml`.
3. **`scripts/scan.ts`** ("plumb for paseo") generates data on demand before local development
   and production builds, then refreshes it during deployment on merges to `main` and nightly. It
   reads `paseo-plugin.json`, `package.json`, `README.md`, `LICENSE`, and `images/` straight from
   each plugin's repo, plus GitHub API metadata (stars, last commit, topics, license), and writes
   ignored, never-hand-edited records and public assets. See
   `.github/workflows/enrich-and-deploy.yml`.
4. The build imports the generated `data/plugins.json` via `src/lib/plugins-data.ts`; the running
   site never talks to GitHub directly.

5. **`.github/workflows/enrich-and-deploy.yml`** refreshes and verifies `data/` + `public/og` +
   `public/sitemap.xml` + `public/robots.txt` in its working tree, then deploys that exact tree to
   [Zerops](https://zerops.io) (`zerops.yaml`). Generated outputs are ignored rather than kept stale
   on protected `main`. Zerops runs a persistent Bun server (via [Nitro](https://nitro.build), wired
   up in `vite.config.ts`), so Vite/Nitro can inline `data/plugins.json` into the server bundle.

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
The plugin name comes from the validated manifest ID. Description, version, license, screenshots,
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

`bun run build` ensures the generated listing exists before producing a deployable bundle. Run
`bun run registry:scan` explicitly to refresh it. Other useful scripts: `bun run typecheck`,
`bun run lint`, `bun run test`.

## Stack

TanStack Start (file-based routes under `src/routes/`), shadcn/ui (`src/components/ui/`,
base-ui-flavored — polymorphism uses `render`, not `asChild`), Tailwind v4, Zod for both the
registry schema (`src/lib/registry-schema.ts`) and the generated plugin schema
(`src/lib/plugin-schema.ts`).
