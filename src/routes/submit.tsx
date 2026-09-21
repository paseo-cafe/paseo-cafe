import {
  IconArrowRight,
  IconBrandGithub,
  IconCheck,
  IconExternalLink,
} from "@tabler/icons-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { type FormEvent, useState } from "react"
import { CopyBlock } from "@/components/copy-block"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { HOME_SEARCH_DEFAULT } from "@/lib/catalog-search"
import { seo } from "@/lib/seo"
import { SITE_REPO } from "@/lib/site"
import {
  CATALOG_CATEGORIES,
  CATALOG_CATEGORY_LABELS,
  CATALOG_PLATFORM_LABELS,
  CATALOG_PLATFORMS,
  type CatalogCategory,
  type CatalogPlatform,
  isValidCatalogPackage,
  isValidCatalogPath,
  isValidCatalogRepository,
} from "../../plugin/shared/catalog"

export const Route = createFileRoute("/submit")({
  head: () =>
    seo({
      title: "Submit your plugin",
      description:
        "Describe your paseo.sh plugin, then open a prefilled GitHub issue. The bot creates the registry pull request for you.",
      path: "/submit",
    }),
  component: SubmitPage,
})

const REGISTRY_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const GIT_STEPS = `git clone https://github.com/${SITE_REPO}.git
cd ${SITE_REPO.split("/")[1]}
git checkout -b add-your-plugin-id
$EDITOR registry/your-plugin-id.json
git add registry/your-plugin-id.json
git commit -m "Add your-plugin-id"
git push -u origin add-your-plugin-id`

const REQUIRED_CHECKS = [
  "Your repo is public on GitHub.",
  "Its paseo-plugin.json id matches the registry filename.",
  "Its package.json has a released semantic version, not 0.0.0, and you will increment it for each plugin update.",
  "Its npm package is public on npmjs.org and contains the same plugin ID and version as the GitHub source.",
]

const RECOMMENDED = [
  "A README with an Install, Installation, Setup, or Getting started section — we pull it into your listing verbatim.",
  "A README with a Limitations, Caveats, or Known issues section if you have one — same deal, pulled in automatically.",
  "If your plugin only runs on certain platforms, declare it here — don't rely on us guessing from your README.",
  "A LICENSE file.",
  "An images/ folder with one or more screenshots.",
  "A demo video — a YouTube or Loom link, or a video dropped directly into the README — gets auto-embedded.",
  "Theme plugins: keep addTheme palettes as literal hex-color objects in index.client.ts or index.client.tsx so the catalog can generate an exact preview.",
  "npm test and npm run typecheck scripts in package.json.",
]

const AUTO_GENERATED = [
  "Name from the validated plugin ID; description, author, and license from package.json, paseo-plugin.json, and the README. package.json.version is the update identity used by the companion catalog.",
  "The install commands: npmjs for Paseo 0.9 and GitHub for Paseo 0.8.",
  "Screenshots, from an images/ folder in your repo.",
  "Demo videos, detected in your README (YouTube, Loom, or an uploaded GitHub video).",
  "A best-effort limitations/caveats excerpt, detected from your README if you didn't declare platforms/caveats yourself.",
  "Star count, last-updated date, and license, from the GitHub API.",
  "Health badges: manifest validity, README/license/tests presence, and recency.",
]

interface SubmissionForm {
  registryId: string
  repo: string
  path: string
  package: string
  categories: CatalogCategory[]
  platforms: CatalogPlatform[]
  caveats: string
}

const INITIAL_FORM: SubmissionForm = {
  registryId: "",
  repo: "",
  path: "",
  package: "",
  categories: [],
  platforms: [],
  caveats: "",
}

interface SubmissionErrors {
  registryId?: string
  repo?: string
  path?: string
  package?: string
  caveats?: string
}

function validateSubmission(form: SubmissionForm): SubmissionErrors {
  const errors: SubmissionErrors = {}
  const registryId = form.registryId.trim()
  const repo = form.repo.trim()
  const path = form.path.trim()
  const packageName = form.package.trim()
  const caveats = form.caveats
    .split("\n")
    .map((caveat) => caveat.trim())
    .filter(Boolean)

  if (
    registryId.length < 2 ||
    registryId.length > 64 ||
    !REGISTRY_ID_PATTERN.test(registryId)
  ) {
    errors.registryId =
      "Use 2–64 lowercase letters, numbers, and single hyphens."
  }
  if (!isValidCatalogRepository(repo)) {
    errors.repo = 'Use the GitHub "owner/repo" format, not a full URL.'
  }
  if (path && !isValidCatalogPath(path)) {
    errors.path = "Use a repository-relative path without . or .. segments."
  }
  if (!packageName) {
    errors.package = "Enter the public npm package for this plugin."
  } else if (!isValidCatalogPackage(packageName)) {
    errors.package = "Use a public npm package name such as @scope/name."
  }
  if (caveats.length > 6) {
    errors.caveats = "Add no more than 6 caveats."
  } else if (caveats.some((caveat) => caveat.length > 140)) {
    errors.caveats = "Keep each caveat to 140 characters or fewer."
  }

  return errors
}

function buildIssueUrl(form: SubmissionForm): string {
  const url = new URL(`https://github.com/${SITE_REPO}/issues/new`)
  const registryId = form.registryId.trim()
  const repo = form.repo.trim()
  const path = form.path.trim()
  const packageName = form.package.trim()
  const caveats = form.caveats
    .split("\n")
    .map((caveat) => caveat.trim())
    .filter(Boolean)
    .join("\n")

  url.searchParams.set("template", "plugin-submission.yml")
  url.searchParams.set("title", `Add plugin: ${registryId}`)
  url.searchParams.set("registry-id", registryId)
  url.searchParams.set("repo", repo)
  if (path) url.searchParams.set("path", path)
  if (packageName) url.searchParams.set("package", packageName)
  if (form.categories.length > 0) {
    url.searchParams.set("categories", form.categories.join(", "))
  }
  if (form.platforms.length > 0) {
    url.searchParams.set("platforms", form.platforms.join(", "))
  }
  if (caveats) url.searchParams.set("caveats", caveats)

  return url.toString()
}

function SubmitPage() {
  const [form, setForm] = useState<SubmissionForm>(INITIAL_FORM)
  const [errors, setErrors] = useState<SubmissionErrors>({})

  function updateField<K extends keyof SubmissionForm>(
    field: K,
    value: SubmissionForm[K]
  ) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function toggleCategory(category: CatalogCategory) {
    updateField(
      "categories",
      form.categories.includes(category)
        ? form.categories.filter((value) => value !== category)
        : [...form.categories, category]
    )
  }

  function togglePlatform(platform: CatalogPlatform) {
    updateField(
      "platforms",
      form.platforms.includes(platform)
        ? form.platforms.filter((value) => value !== platform)
        : [...form.platforms, platform]
    )
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateSubmission(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    window.open(buildIssueUrl(form), "_blank", "noopener,noreferrer")
  }

  return (
    <div className="page-body">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-section">
        <div className="flex flex-col gap-stack">
          <p className="type-eyebrow text-muted-foreground">
            Community registry intake
          </p>
          <h1 className="type-title">Submit your plugin</h1>
          <p className="type-lead max-w-2xl text-muted-foreground">
            Fill in the listing details here, then review and submit them on
            GitHub. The registry bot writes the file and opens the pull request
            for you.
          </p>
        </div>

        <div className="surface-panel grid sm:grid-cols-3">
          {[
            ["01", "Describe", "Enter the registry details."],
            ["02", "Confirm", "Review the prefilled GitHub issue."],
            ["03", "Automate", "The bot opens the registry PR."],
          ].map(([number, title, description], index) => (
            <div
              key={number}
              className={`flex flex-col gap-inline p-base ${index > 0 ? "border-border border-t sm:border-t-0 sm:border-l" : ""}`}
            >
              <p className="type-meta font-mono text-muted-foreground">
                {number}
              </p>
              <p className="type-eyebrow text-foreground">{title}</p>
              <p className="type-meta text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>

        <Separator />

        <section className="flex flex-col gap-base">
          <h2 className="type-heading">1. Before you submit</h2>
          <div>
            <p className="type-label text-muted-foreground">Required</p>
            <ul className="flex flex-col gap-group">
              {REQUIRED_CHECKS.map((item) => (
                <li key={item} className="type-body flex items-start gap-group">
                  <IconCheck className="mt-hair shrink-0 text-green-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="type-label text-muted-foreground">
              Recommended — not required to get in, but makes your listing much
              better
            </p>
            <ul className="flex flex-col gap-group">
              {RECOMMENDED.map((item) => (
                <li
                  key={item}
                  className="type-body flex items-start gap-group text-muted-foreground"
                >
                  <IconCheck className="mt-hair shrink-0 text-muted-foreground/60" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Separator />

        <section className="flex flex-col gap-base">
          <div>
            <h2 className="type-heading">2. Describe your plugin</h2>
            <p className="type-body text-muted-foreground">
              These answers become the registry entry. Everything else is read
              from the plugin repository automatically.
            </p>
          </div>

          <form className="surface-panel" onSubmit={submit} noValidate>
            <div className="grid gap-stack border-border border-b p-base sm:grid-cols-[11rem_1fr]">
              <label htmlFor="registry-id" className="type-label">
                Registry id
                <span className="type-meta block text-muted-foreground">
                  Required
                </span>
              </label>
              <div>
                <Input
                  id="registry-id"
                  value={form.registryId}
                  onChange={(event) =>
                    updateField("registryId", event.target.value)
                  }
                  placeholder="my-plugin"
                  maxLength={64}
                  aria-invalid={Boolean(errors.registryId)}
                  aria-describedby="registry-id-help"
                  autoComplete="off"
                />
                <p
                  id="registry-id-help"
                  className={`type-meta mt-chip ${errors.registryId ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {errors.registryId ??
                    "Lowercase kebab-case. Becomes registry/my-plugin.json."}
                </p>
              </div>
            </div>

            <div className="grid gap-stack border-border border-b p-base sm:grid-cols-[11rem_1fr]">
              <label htmlFor="repo" className="type-label">
                GitHub repository
                <span className="type-meta block text-muted-foreground">
                  Required
                </span>
              </label>
              <div>
                <Input
                  id="repo"
                  value={form.repo}
                  onChange={(event) => updateField("repo", event.target.value)}
                  placeholder="yourname/your-repo"
                  aria-invalid={Boolean(errors.repo)}
                  aria-describedby="repo-help"
                  autoComplete="off"
                />
                <p
                  id="repo-help"
                  className={`type-meta mt-chip ${errors.repo ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {errors.repo ??
                    'Public "owner/repo" hosting paseo-plugin.json. Do not paste a full URL.'}
                </p>
              </div>
            </div>

            <div className="grid gap-stack border-border border-b p-base sm:grid-cols-[11rem_1fr]">
              <label htmlFor="path" className="type-label">
                Plugin subpath
                <span className="type-meta block text-muted-foreground">
                  Optional
                </span>
              </label>
              <div>
                <Input
                  id="path"
                  value={form.path}
                  onChange={(event) => updateField("path", event.target.value)}
                  placeholder="packages/my-plugin"
                  maxLength={500}
                  aria-invalid={Boolean(errors.path)}
                  aria-describedby="path-help"
                  autoComplete="off"
                />
                <p
                  id="path-help"
                  className={`type-meta mt-chip ${errors.path ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {errors.path ??
                    "Only needed when one repository hosts multiple plugins."}
                </p>
              </div>
            </div>
            <div className="grid gap-stack border-border border-b p-base sm:grid-cols-[11rem_1fr]">
              <label htmlFor="package" className="type-label">
                npm package
                <span className="type-meta block text-muted-foreground">
                  Required · npmjs.org only
                </span>
              </label>
              <div>
                <Input
                  id="package"
                  value={form.package}
                  onChange={(event) =>
                    updateField("package", event.target.value)
                  }
                  placeholder="@yourname/paseo-plugin"
                  required
                  maxLength={214}
                  aria-invalid={Boolean(errors.package)}
                  aria-describedby="package-help"
                  autoComplete="off"
                />
                <p
                  id="package-help"
                  className={`type-meta mt-chip ${errors.package ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {errors.package ??
                    "Paseo 0.9 installs this package; Paseo 0.8 uses the GitHub source."}
                </p>
              </div>
            </div>

            <fieldset className="grid gap-stack border-border border-b p-base sm:grid-cols-[11rem_1fr]">
              <legend className="sr-only">Categories</legend>
              <div className="type-label">
                Categories
                <span className="type-meta block text-muted-foreground">
                  Optional
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-base gap-y-group sm:grid-cols-3">
                {CATALOG_CATEGORIES.map((category) => (
                  <label
                    key={category}
                    className="type-meta flex cursor-pointer items-center gap-group"
                  >
                    <input
                      type="checkbox"
                      checked={form.categories.includes(category)}
                      onChange={() => toggleCategory(category)}
                      className="size-icon-sm rounded-none accent-foreground"
                    />
                    {CATALOG_CATEGORY_LABELS[category]}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-stack border-border border-b p-base sm:grid-cols-[11rem_1fr]">
              <legend className="sr-only">Platforms</legend>
              <div className="type-label">
                Platforms
                <span className="type-meta block text-muted-foreground">
                  Optional restriction
                </span>
              </div>
              <div>
                <div className="flex flex-wrap gap-x-base gap-y-group">
                  {CATALOG_PLATFORMS.map((platform) => (
                    <label
                      key={platform}
                      className="type-meta flex cursor-pointer items-center gap-group"
                    >
                      <input
                        type="checkbox"
                        checked={form.platforms.includes(platform)}
                        onChange={() => togglePlatform(platform)}
                        className="size-icon-sm rounded-none accent-foreground"
                      />
                      {CATALOG_PLATFORM_LABELS[platform]}
                    </label>
                  ))}
                </div>
                <p className="type-meta mt-group text-muted-foreground">
                  Leave blank when the plugin is not platform-restricted.
                </p>
              </div>
            </fieldset>

            <div className="grid gap-stack border-border border-b p-base sm:grid-cols-[11rem_1fr]">
              <label htmlFor="caveats" className="type-label">
                Caveats
                <span className="type-meta block text-muted-foreground">
                  Optional
                </span>
              </label>
              <div>
                <Textarea
                  id="caveats"
                  value={form.caveats}
                  onChange={(event) =>
                    updateField("caveats", event.target.value)
                  }
                  placeholder={
                    "Requires an OpenAI API key\nExperimental - breaking changes expected"
                  }
                  rows={3}
                  aria-invalid={Boolean(errors.caveats)}
                  aria-describedby="caveats-help"
                />
                <p
                  id="caveats-help"
                  className={`type-meta mt-chip ${errors.caveats ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {errors.caveats ??
                    "One per line. Up to 6 single-sentence caveats, 140 characters each."}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-stack bg-muted p-base sm:flex-row sm:items-center sm:justify-between">
              <p className="type-meta max-w-md text-muted-foreground">
                GitHub opens with these answers filled in. Tick the two required
                confirmation boxes, then submit the issue. You may be asked to
                sign in.
              </p>
              <Button type="submit" className="w-fit">
                <IconBrandGithub /> Review on GitHub
                <IconExternalLink className="size-icon-sm" />
              </Button>
            </div>
          </form>

          <details className="surface-panel">
            <summary className="type-label cursor-pointer px-base py-stack">
              Need the manual pull request path?
            </summary>
            <div className="flex flex-col gap-stack border-border border-t p-base">
              <p className="type-meta text-muted-foreground">
                Use this only when the issue form cannot express the registry
                change you need. New plugin submissions should use the form
                above.
              </p>
              <CopyBlock code={GIT_STEPS} />
            </div>
          </details>
        </section>

        <Separator />

        <section className="flex flex-col gap-base">
          <h2 className="type-heading">3. What happens next</h2>
          <ol className="type-body flex flex-col gap-stack text-muted-foreground">
            <li>
              <strong className="text-foreground">Submit the issue:</strong>{" "}
              GitHub shows every prefilled answer for a final review and asks
              you to confirm the manifest id and released package version.
            </li>
            <li>
              <strong className="text-foreground">The bot opens a PR:</strong>{" "}
              the issue is validated, converted into the registry JSON file, and
              referenced by the generated pull request.
            </li>
            <li>
              <strong className="text-foreground">Registry admission:</strong>{" "}
              the normal checks confirm the repo/path exists, the manifest id
              matches, and the plugin passes the security scan.
            </li>
            <li>
              <strong className="text-foreground">On merge:</strong> your full
              listing is generated from its published sources. Six-hour scans
              refresh npm downloads and publish dates or GitHub stars without
              another PR.
            </li>
          </ol>
        </section>

        <Separator />

        <section className="flex flex-col gap-base">
          <h2 className="type-heading">What you don't need to write</h2>
          <ul className="flex flex-col gap-group">
            {AUTO_GENERATED.map((item) => (
              <li
                key={item}
                className="type-body flex items-start gap-group text-muted-foreground"
              >
                <IconCheck className="mt-hair shrink-0 text-green-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <Separator />

        <div className="flex flex-wrap items-center gap-base">
          <Button
            nativeButton={false}
            render={<Link to="/" search={HOME_SEARCH_DEFAULT} />}
          >
            Browse existing plugins <IconArrowRight />
          </Button>
          <a
            href={`https://github.com/${SITE_REPO}`}
            target="_blank"
            rel="noreferrer"
            className="type-body flex items-center gap-inline text-muted-foreground hover:text-foreground"
          >
            <IconBrandGithub /> Read the source
            <IconExternalLink className="size-icon-sm" />
          </a>
        </div>
      </div>
    </div>
  )
}
