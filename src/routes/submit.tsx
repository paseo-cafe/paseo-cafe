import {
  IconArrowRight,
  IconBrandGithub,
  IconCheck,
  IconExternalLink,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CopyBlock } from "@/components/copy-block"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { seo } from "@/lib/seo"
import { SITE_REPO } from "@/lib/site"
import { HOME_SEARCH_DEFAULT } from "@/routes/index"

export const Route = createFileRoute("/submit")({
  head: () =>
    seo({
      title: "Submit your plugin",
      description:
        "Add your paseo.sh plugin to the directory with a single JSON file — no dashboard, no form.",
      path: "/submit",
    }),
  component: SubmitPage,
})

const REGISTRY_TEMPLATE = `{
  "repo": "yourname/your-repo",
  "categories": ["productivity"],
  "submittedBy": "yourname"
}`

const GIT_STEPS = `git clone https://github.com/${SITE_REPO}.git
cd ${SITE_REPO.split("/")[1]}
$EDITOR registry/your-plugin-id.json
git checkout -b add-your-plugin-id
git add registry/your-plugin-id.json
git commit -m "Add your-plugin-id"
git push -u origin add-your-plugin-id`

const createFileUrl = `https://github.com/${SITE_REPO}/new/main?filename=${encodeURIComponent(
  "registry/your-plugin-id.json"
)}&value=${encodeURIComponent(REGISTRY_TEMPLATE)}`

const FIELDS: { field: string; required: boolean; description: string }[] = [
  {
    field: "repo",
    required: true,
    description: `GitHub "owner/repo" — just the repo, not a full URL.`,
  },
  {
    field: "path",
    required: false,
    description:
      "Subpath within the repo, only if it hosts more than one plugin. Omit otherwise.",
  },
  {
    field: "categories",
    required: false,
    description: 'Free-form tags, e.g. ["productivity", "monitoring"].',
  },
  {
    field: "platforms",
    required: false,
    description:
      'Only if your plugin is platform-restricted, e.g. ["macos"]. Omit if it runs anywhere — this is a positive declaration, not a guarantee for what\'s left out.',
  },
  {
    field: "caveats",
    required: false,
    description:
      'Short, one-sentence limitations worth flagging before install, e.g. ["Requires an OpenAI API key"]. Up to 6.',
  },
  {
    field: "submittedBy",
    required: false,
    description: "Your GitHub username, for attribution.",
  },
]

const REQUIRED_CHECKS = [
  "Your repo is public on GitHub.",
  "Its paseo-plugin.json id matches the registry filename.",
]

const RECOMMENDED = [
  "A README with an Install, Installation, Setup, or Getting started section — we pull it into your listing verbatim.",
  "A README with a Limitations, Caveats, or Known issues section if you have one — same deal, pulled in automatically.",
  "If your plugin only runs on certain platforms, declare it with platforms in your registry entry — don't rely on us guessing from your README.",
  "A LICENSE file.",
  "An images/ folder with one or more screenshots.",
  "A demo video — a YouTube or Loom link, or a video dropped directly into the README — gets auto-embedded.",
  "npm test and npm run typecheck scripts in package.json.",
]

const AUTO_GENERATED = [
  "Name from the validated plugin ID; description, version, author, and license from package.json, paseo-plugin.json, and the README.",
  "The exact install command (paseo plugin add ...), derived from repo + path.",
  "Screenshots, from an images/ folder in your repo.",
  "Demo videos, detected in your README (YouTube, Loom, or an uploaded GitHub video).",
  "A best-effort limitations/caveats excerpt, detected from your README if you didn't declare platforms/caveats yourself.",
  "Star count, last-updated date, and license, from the GitHub API.",
  "Health badges: manifest validity, README/license/tests presence, and recency.",
]

function SubmitPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-col gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">
          Submit your plugin
        </h1>
        <p className="max-w-2xl text-foreground/70">
          Every listing on this site is generated from your plugin's own repo.
          Submitting one is a single JSON file — no dashboard, no form, no other
          build step.
        </p>
      </div>

      <Separator className="my-8" />

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl tracking-tight">
          1. Before you submit
        </h2>
        <div>
          <p className="mb-2 font-medium text-foreground/60 text-sm">
            Required
          </p>
          <ul className="flex flex-col gap-2">
            {REQUIRED_CHECKS.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <IconCheck className="mt-0.5 size-4 shrink-0 text-green-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-medium text-foreground/60 text-sm">
            Recommended — not required to get in, but makes your listing much
            better
          </p>
          <ul className="flex flex-col gap-2">
            {RECOMMENDED.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-foreground/70 text-sm"
              >
                <IconCheck className="mt-0.5 size-4 shrink-0 text-foreground/30" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Separator className="my-8" />

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl tracking-tight">
          2. Add a registry entry
        </h2>
        <p className="text-foreground/70 text-sm">
          Add one file named after your plugin's manifest ID, such as{" "}
          <code className="text-foreground">registry/your-plugin-id.json</code>.
          This is the entire submission; everything else is read from your repo
          automatically.
        </p>
        <CopyBlock
          code={REGISTRY_TEMPLATE}
          label="registry/your-plugin-id.json"
        />

        <dl className="mt-2 flex flex-col gap-3">
          {FIELDS.map(({ field, required, description }) => (
            <div
              key={field}
              className="grid grid-cols-[8rem_1fr] gap-3 text-sm"
            >
              <dt className="flex flex-col font-mono text-foreground">
                <span>{field}</span>
                {!required ? (
                  <span className="text-foreground/40 text-xs">optional</span>
                ) : null}
              </dt>
              <dd className="text-foreground/70">{description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Separator className="my-8" />

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl tracking-tight">
          3. Open a pull request
        </h2>
        <p className="text-foreground/70 text-sm">
          Quickest: create the file directly on GitHub, prefilled.
        </p>
        <Button
          nativeButton={false}
          className="w-fit"
          render={<a href={createFileUrl} target="_blank" rel="noreferrer" />}
        >
          <IconBrandGithub className="size-4" /> Create your registry file on
          GitHub
          <IconExternalLink className="size-3.5" />
        </Button>
        <p className="mt-2 text-foreground/70 text-sm">
          Or, from the command line:
        </p>
        <CopyBlock code={GIT_STEPS} />
      </section>

      <Separator className="my-8" />

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl tracking-tight">
          4. What happens next
        </h2>
        <ol className="flex flex-col gap-3 text-foreground/70 text-sm">
          <li>
            <strong className="text-foreground">On open:</strong> a check runs
            automatically, confirming your repo/path exists and the manifest ID
            matches the registry filename. A green check means it is ready to
            merge.
          </li>
          <li>
            <strong className="text-foreground">On merge:</strong> your full
            listing gets generated from your repository, including its name,
            description, install command, screenshots, video, and health badges.
          </li>
          <li>
            <strong className="text-foreground">Every night:</strong> everything
            gets re-scanned, so stars, last-updated, and broken-repo detection
            stay current even without a new PR.
          </li>
        </ol>
      </section>

      <Separator className="my-8" />

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold text-xl tracking-tight">
          What you don't need to write
        </h2>
        <ul className="flex flex-col gap-2">
          {AUTO_GENERATED.map((item) => (
            <li
              key={item}
              className="flex items-start gap-2 text-foreground/70 text-sm"
            >
              <IconCheck className="mt-0.5 size-4 shrink-0 text-green-600" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <Separator className="my-8" />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          nativeButton={false}
          render={<Link to="/" search={HOME_SEARCH_DEFAULT} />}
        >
          Browse existing plugins <IconArrowRight className="size-4" />
        </Button>
        <a
          href={`https://github.com/${SITE_REPO}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-foreground/60 text-sm hover:text-foreground"
        >
          <IconBrandGithub className="size-4" /> Read the source
          <IconExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  )
}
