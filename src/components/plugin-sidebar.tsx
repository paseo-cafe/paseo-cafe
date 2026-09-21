import {
  IconAlertTriangle,
  IconBrandGithub,
  IconDownload,
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
import {
  formatCatalogDownloads,
  hasCompleteCatalogNpmMetrics,
} from "../../plugin/shared/catalog"

export function PluginSidebar({ plugin }: { plugin: PluginRecord }) {
  const username = pluginOwnerLogin(plugin)
  const repositoryUrl = pluginRepositoryUrl(plugin)
  const hasNpmMetrics = hasCompleteCatalogNpmMetrics(plugin)

  return (
    <aside className="sidebar-column">
      <Link
        to="/user/$username"
        params={{ username }}
        className="flex items-center gap-group hover:opacity-80"
      >
        {plugin.owner ? (
          <img
            src={plugin.owner.avatarUrl}
            alt=""
            className="size-icon-md shrink-0 rounded-full border border-border"
          />
        ) : (
          <IconBrandGithub className="shrink-0 text-muted-foreground" />
        )}
        <span className="type-label text-foreground hover:underline">
          {username}
        </span>
      </Link>

      <div className="type-body flex flex-col gap-chip">
        <a
          href={repositoryUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-chip text-foreground hover:underline"
        >
          <IconBrandGithub className="shrink-0" /> {plugin.repo}
          <IconExternalLink className="size-icon-sm shrink-0" />
        </a>
        <a
          href={buildReportIssueUrl(plugin)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-chip text-foreground hover:underline"
        >
          <IconAlertTriangle className="shrink-0" /> Report plugin
          <IconExternalLink className="size-icon-sm shrink-0" />
        </a>
      </div>
      <div className="type-body flex flex-col gap-chip text-muted-foreground">
        {hasNpmMetrics ? (
          <span className="flex items-center gap-chip">
            <IconDownload className="shrink-0" />
            {formatCatalogDownloads(plugin.npm.downloadsLast30Days)}
          </span>
        ) : plugin.repoMeta ? (
          <span className="flex items-center gap-chip">
            <IconStar className="shrink-0" /> {plugin.repoMeta.stars} stars
          </span>
        ) : null}
        {hasNpmMetrics ? (
          <span>
            Published <ReaderDate iso={plugin.npm.publishedAt} />
          </span>
        ) : null}
        {plugin.license ? <span>License: {plugin.license}</span> : null}
        {plugin.author ? <span>By {plugin.author}</span> : null}
      </div>

      {plugin.categories.length > 0 ? (
        <div className="flex flex-col gap-group">
          <span className="type-eyebrow text-muted-foreground">Categories</span>
          <div className="flex flex-wrap gap-chip">
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
        <div className="flex flex-col gap-group">
          <span className="type-eyebrow text-muted-foreground">Platforms</span>
          <div className="flex flex-wrap gap-chip">
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
      {plugin.package ? (
        <PluginSecurityScanSection security={plugin.npmSecurity} source="npm" />
      ) : null}
      <PluginSecurityScanSection security={plugin.security} source="Git" />
    </aside>
  )
}
