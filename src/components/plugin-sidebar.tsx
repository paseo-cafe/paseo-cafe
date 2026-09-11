import {
  IconAlertTriangle,
  IconBrandGithub,
  IconExternalLink,
  IconStar,
} from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { PluginHealthChecks } from "@/components/plugin-health-checks"
import { PluginManifest } from "@/components/plugin-manifest"
import { PluginSecurityScanSection } from "@/components/plugin-security-scan"
import { ReaderDate } from "@/components/reader-date"
import { Badge } from "@/components/ui/badge"
import { HOME_SEARCH_DEFAULT } from "@/lib/catalog-search"
import type { PluginRecord } from "@/lib/plugin-schema"
import { pluginOwnerLogin } from "@/lib/plugin-schema"
import { pluginRepositoryUrl } from "@/lib/plugin-source"
import { normalizeCategory, PLATFORM_LABELS } from "@/lib/registry-schema"
import { buildReportIssueUrl } from "@/lib/report-issue-url"

export function PluginSidebar({ plugin }: { plugin: PluginRecord }) {
  const username = pluginOwnerLogin(plugin)
  const repositoryUrl = pluginRepositoryUrl(plugin)

  return (
    <aside className="flex flex-col gap-6 bg-card p-3 lg:sticky lg:top-20 lg:w-1/3 lg:shrink-0 lg:self-start">
      <Link
        to="/user/$username"
        params={{ username }}
        className="flex items-center gap-2 hover:opacity-80"
      >
        {plugin.owner ? (
          <img
            src={plugin.owner.avatarUrl}
            alt=""
            className="size-4 shrink-0 rounded-full ring-1 ring-foreground/10"
          />
        ) : (
          <IconBrandGithub className="size-8 text-foreground/40" />
        )}
        <span className="font-medium text-foreground text-sm hover:underline">
          {username}
        </span>
      </Link>

      <div className="flex flex-col gap-1.5 text-sm">
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-foreground hover:underline"
        >
          <IconBrandGithub className="size-4 shrink-0" /> {plugin.repo}
          <IconExternalLink className="size-3.5 shrink-0" />
        </a>
        <a
          href={buildReportIssueUrl(plugin)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-foreground hover:underline"
        >
          <IconAlertTriangle className="size-4 shrink-0" /> Report plugin
          <IconExternalLink className="size-3.5 shrink-0" />
        </a>
      </div>
      <div className="flex flex-col gap-1.5 text-foreground/70 text-sm">
        {plugin.repoMeta ? (
          <span className="flex items-center gap-1.5">
            <IconStar className="size-4 shrink-0" /> {plugin.repoMeta.stars}{" "}
            stars
          </span>
        ) : null}
        {plugin.license ? <span>License: {plugin.license}</span> : null}
        {plugin.author ? <span>By {plugin.author}</span> : null}
        {plugin.repoMeta ? (
          <span>
            Last updated <ReaderDate iso={plugin.repoMeta.pushedAt} />
          </span>
        ) : null}
      </div>

      {plugin.categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
            Categories
          </span>
          <div className="flex flex-wrap gap-1.5">
            {plugin.categories.map((c) => (
              <Link
                key={c}
                to="/"
                search={{
                  ...HOME_SEARCH_DEFAULT,
                  category: normalizeCategory(c),
                }}
              >
                <Badge
                  variant="secondary"
                  className="cursor-pointer hover:opacity-80"
                >
                  {c}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {plugin.platforms.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="font-medium text-foreground/50 text-xs uppercase tracking-wide">
            Platforms
          </span>
          <div className="flex flex-wrap gap-1.5">
            {plugin.platforms.map((p) => (
              <Badge key={p} variant="outline">
                {PLATFORM_LABELS[p]}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <PluginManifest manifest={plugin.manifest} />
      <PluginHealthChecks health={plugin.health} />
      <PluginSecurityScanSection security={plugin.security} />
    </aside>
  )
}
