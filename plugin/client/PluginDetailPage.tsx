import type { PluginTheme } from "@getpaseo/plugin"
import {
  copyText,
  Icon,
  Modal,
  ScrollView,
  useToast,
} from "@getpaseo/plugin/client/react-native"
import { useMemo, useState } from "react"
import { Image, Pressable, Text, View } from "react-native"
import { getCatalogGalleryImages } from "../shared/catalog"
import { BORDER_WIDTH, ICON, SPACE } from "../shared/design-tokens"
import type {
  DirectoryCategory,
  DirectoryEntry,
  InstalledPlugin,
} from "../shared/directory"
import {
  DIRECTORY_CATEGORY_LABELS,
  DIRECTORY_PLATFORM_LABELS,
  directoryCaveatNodes,
  directoryDescriptionNodes,
  formatDirectoryDate,
  formatDirectoryDownloads,
  formatDirectoryVersion,
  getInstallationStateLabel,
  getInstallCommand,
  getReportPluginIssueUrl,
  getRepositoryOwner,
  getRepositoryUrl,
  getRepositoryUrlAtRef,
  getSiteUrl,
  getUpdateCommand,
  getUpdateReviewDetails,
  HEALTH_KEYS,
  HEALTH_LABELS,
  hasCompleteDirectoryNpmMetrics,
  isOfficialPlugin,
  isPreviewUpdateAvailable,
  stripHtml,
} from "../shared/directory"
import { ExpandableSection } from "./ExpandableSection"
import { InlineMarkdown } from "./InlineMarkdown"
import { ThemePreviewCard } from "./ThemePreviewCard"
import {
  CAFE_CONTROL_RADIUS,
  chipStyle,
  insetStyle,
  panelStyle,
  typeStyle,
} from "./visual"
import { openExternal } from "./web"

// Owner avatars are images, so their size is explicit rather than a token.
const AVATAR_SIZE = 20

interface PluginDetailPageProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  npmSupported: boolean
  installations: readonly InstalledPlugin[]
  inventoryAvailable: boolean
  installing: boolean
  updatingId: string | null
  installError: string | null
  updateError: string | null
  onInstall: (channel: "stable" | "preview") => void
  onUpdate: (
    installation: InstalledPlugin,
    channel: "stable" | "preview"
  ) => void
  onOpenGallery: () => void
  onBack: () => void
}

/** "2026-09-08T01:09:51Z" -> "08 Sep 2026", the same rendering the website uses. */
function formatDate(iso: string | undefined): string | undefined {
  return iso ? formatDirectoryDate(iso) : undefined
}

export function PluginDetailPage({
  entry,
  theme,
  compact,
  npmSupported,
  installations,
  inventoryAvailable,
  installing,
  updatingId,
  installError,
  updateError,
  onInstall,
  onUpdate,
  onOpenGallery,
  onBack,
}: PluginDetailPageProps) {
  const toast = useToast()
  const [confirmingInstall, setConfirmingInstall] = useState<
    "stable" | "preview" | null
  >(null)
  const [confirmingUpdate, setConfirmingUpdate] = useState<{
    installation: InstalledPlugin
    channel: "stable" | "preview"
  } | null>(null)
  const [showFullActionError, setShowFullActionError] = useState(false)
  const [showReadme, setShowReadme] = useState(false)
  const galleryImages = getCatalogGalleryImages(entry.images, entry.owner)

  const manifestText = useMemo(
    () =>
      entry.manifest === undefined
        ? undefined
        : JSON.stringify(entry.manifest, null, 2),
    [entry.manifest]
  )
  const readmeText = entry.readmeText?.length ? entry.readmeText : undefined
  const descriptionNodes = directoryDescriptionNodes(entry)

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        width: "100%" as const,
        maxWidth: 960,
        alignSelf: "center" as const,
        padding: SPACE.base,
        gap: SPACE.base,
      },
      backRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.inline,
        marginBottom: SPACE.inline,
      },
      backText: {
        ...typeStyle("label"),
        color: theme.colors.accent,
      },
      headerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.stack,
        flexWrap: "wrap" as const,
      },
      ownerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.chip,
      },
      avatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
      },
      ownerText: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
      },
      title: {
        ...typeStyle("title"),
        color: theme.colors.foreground,
        flexShrink: 1,
      },
      errorBadge: {
        ...chipStyle(theme),
        backgroundColor: theme.colors.statusDanger,
      },
      errorBadgeText: {
        ...typeStyle("meta"),
        color: theme.colors.accentForeground,
      },
      description: {
        ...typeStyle("body"),
        color: theme.colors.foregroundMuted,
      },
      tagsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.chip,
      },
      tag: chipStyle(theme),
      tagText: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
      },
      requirementTag: {
        ...chipStyle(theme),
        backgroundColor: theme.colors.accent,
      },
      requirementTagText: {
        ...typeStyle("meta"),
        color: theme.colors.accentForeground,
      },
      metaRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.base,
        alignItems: "center" as const,
      },
      metaItem: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.inline,
      },
      metaText: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
      },
      linkText: {
        ...typeStyle("meta"),
        color: theme.colors.accent,
      },
      siteButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.inline,
        alignSelf: "flex-start" as const,
        paddingHorizontal: SPACE.base,
        paddingVertical: SPACE.stack,
        borderRadius: CAFE_CONTROL_RADIUS,
        backgroundColor: theme.colors.accent,
      },
      siteButtonText: {
        ...typeStyle("label"),
        color: theme.colors.accentForeground,
      },
      alert: {
        ...panelStyle(theme),
        gap: SPACE.group,
        padding: SPACE.stack,
      },
      alertTitleRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.chip,
      },
      alertTitle: {
        ...typeStyle("label"),
        color: theme.colors.foreground,
      },
      alertBody: {
        ...typeStyle("body"),
        color: theme.colors.foregroundMuted,
      },
      caveatLine: {
        ...typeStyle("body"),
        color: theme.colors.statusWarning,
      },
      readmeLabel: {
        ...typeStyle("eyebrow"),
        color: theme.colors.foregroundMuted,
        marginTop: SPACE.group,
        marginBottom: SPACE.inline,
      },
      readmeText: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
      },
      errorBox: {
        ...panelStyle(theme),
        borderColor: theme.colors.statusDanger,
        padding: SPACE.stack,
        gap: SPACE.group,
      },
      errorText: {
        ...typeStyle("body"),
        color: theme.colors.statusDanger,
      },
      errorDetails: {
        ...typeStyle("meta"),
        color: theme.colors.foreground,
      },
      errorActions: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.stack,
      },
      errorAction: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.inline,
      },
      errorActionText: {
        ...typeStyle("label"),
        color: theme.colors.accent,
      },
      // Bleeds to the page gutter, so it must match `content.padding`.
      gallery: { marginHorizontal: -SPACE.base },
      galleryContent: { paddingHorizontal: SPACE.base, gap: SPACE.stack },
      galleryTile: {
        width: compact ? 220 : 280, // Explicit thumbnail width.
        aspectRatio: 16 / 9,
        borderRadius: CAFE_CONTROL_RADIUS,
        backgroundColor: theme.colors.surface2,
      },
      section: { gap: SPACE.group },
      themeGrid: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.stack,
      },
      label: {
        ...typeStyle("eyebrow"),
        color: theme.colors.foregroundMuted,
      },
      commandRow: {
        flexDirection: "row" as const,
        alignItems: "stretch" as const,
        gap: SPACE.group,
      },
      command: {
        ...insetStyle(theme),
        ...typeStyle("meta"),
        flex: 1,
        color: theme.colors.foreground,
        padding: SPACE.stack,
      },
      copyButton: {
        alignItems: "center" as const,
        justifyContent: "center" as const,
        paddingHorizontal: SPACE.stack,
        borderRadius: CAFE_CONTROL_RADIUS,
        borderWidth: BORDER_WIDTH,
        borderColor: theme.colors.border,
      },
      actionsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.stack,
      },
      button: {
        paddingHorizontal: SPACE.base,
        paddingVertical: SPACE.stack,
        borderRadius: CAFE_CONTROL_RADIUS,
        backgroundColor: theme.colors.accent,
        opacity: installing || updatingId !== null ? 0.6 : 1,
      },
      buttonText: {
        ...typeStyle("label"),
        color: theme.colors.accentForeground,
      },
      manifestViewer: {
        ...insetStyle(theme),
        padding: SPACE.stack,
      },
      manifestText: {
        ...typeStyle("meta"),
        color: theme.colors.foreground,
      },
      readmeHeaderRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.stack,
      },
      readmeViewer: {
        ...insetStyle(theme),
        padding: SPACE.stack,
      },
      secondaryButton: {
        paddingHorizontal: SPACE.base,
        paddingVertical: SPACE.stack,
        borderRadius: CAFE_CONTROL_RADIUS,
        borderWidth: BORDER_WIDTH,
        borderColor: theme.colors.border,
      },
      secondaryButtonText: {
        ...typeStyle("label"),
        color: theme.colors.foreground,
      },
      installationList: { gap: SPACE.group },
      installationCard: {
        ...panelStyle(theme),
        gap: SPACE.group,
        padding: SPACE.stack,
      },
      installationTitle: {
        ...typeStyle("label"),
        color: theme.colors.foreground,
      },
      healthGrid: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: SPACE.stack,
      },
      healthItem: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: SPACE.chip,
        width: compact ? ("100%" as const) : ("48%" as const),
      },
      healthText: typeStyle("body"),
      footer: {
        ...typeStyle("meta"),
        color: theme.colors.foregroundMuted,
      },
      modalBody: { gap: SPACE.base },
      modalTitle: {
        ...typeStyle("subheading"),
        color: theme.colors.foreground,
      },
      modalText: {
        ...typeStyle("body"),
        color: theme.colors.foregroundMuted,
      },
    }),
    [theme, compact, installing, updatingId]
  )
  const command = getInstallCommand(entry, npmSupported, "stable")
  const previewCommand = getInstallCommand(entry, npmSupported, "preview")
  const repositoryUrl = getRepositoryUrl(entry)
  const updateRepositoryUrl = confirmingUpdate?.installation.latestCommit
    ? getRepositoryUrlAtRef(entry, confirmingUpdate.installation.latestCommit)
    : repositoryUrl
  const updateTargetVersion =
    confirmingUpdate?.channel === "preview"
      ? entry.npmPreview?.version
      : entry.version
  const updateReview = confirmingUpdate
    ? getUpdateReviewDetails(confirmingUpdate.installation, {
        version: updateTargetVersion,
      })
    : null
  const repositoryOwner = getRepositoryOwner(entry.repo)
  const ownerMetadataMatchesRepository =
    entry.owner?.login?.toLowerCase() === repositoryOwner.toLowerCase()
  const tags = [
    ...entry.categories.map(
      (category) =>
        DIRECTORY_CATEGORY_LABELS[category as DirectoryCategory] ?? category
    ),
    ...entry.platforms.map(
      (platform) =>
        DIRECTORY_PLATFORM_LABELS[
          platform as keyof typeof DIRECTORY_PLATFORM_LABELS
        ] ?? platform
    ),
  ]
  const versionLabel = formatDirectoryVersion(entry.version)
  const hasNpmMetrics = hasCompleteDirectoryNpmMetrics(entry)
  const limitationsText = entry.limitationsNotesHtml
    ? stripHtml(entry.limitationsNotesHtml)
    : undefined
  const installNotesText = entry.installNotesHtml
    ? stripHtml(entry.installNotesHtml)
    : undefined
  const hasCaveatsSection =
    entry.platforms.length > 0 || entry.caveats.length > 0 || !!limitationsText
  const health = entry.health
  const installingFromNpm = Boolean(npmSupported && entry.package)
  const security = installingFromNpm ? entry.npmSecurity : entry.security
  const securityStatus = security?.status ?? "unknown"
  const securityAttestation =
    security && (security.status === "passed" || security.status === "failed")
      ? security
      : undefined
  const securityStatusLabel =
    securityStatus === "passed"
      ? "Passed"
      : securityStatus === "failed"
        ? "Failed"
        : "Unknown"
  const securityStatusColor =
    securityStatus === "passed"
      ? theme.colors.statusSuccess
      : securityStatus === "failed"
        ? theme.colors.statusDanger
        : theme.colors.statusWarning
  const healthValues = HEALTH_KEYS.map((key) => health?.[key])
  const knownHealthChecks = healthValues.filter(
    (value) => value !== undefined
  ).length
  const passedHealthChecks = healthValues.filter(
    (value) => value === true
  ).length
  const failedHealthChecks = healthValues.filter(
    (value) => value === false
  ).length
  const unknownHealthChecks = healthValues.length - knownHealthChecks
  const healthSummary =
    knownHealthChecks === 0
      ? "Unknown"
      : `${passedHealthChecks} passed · ${failedHealthChecks} not passed${
          unknownHealthChecks > 0 ? ` · ${unknownHealthChecks} unknown` : ""
        }`
  const catalogScannedDate = formatDate(entry.scannedAt)
  const securityScannedDate = formatDate(securityAttestation?.scannedAt)
  const securityReportUrl = installingFromNpm
    ? undefined
    : entry.security?.reportUrl
  const securityCommit = installingFromNpm ? undefined : entry.security?.commit
  const selectedInstallCommand =
    confirmingInstall === "preview" ? previewCommand : command
  const selectedInstallVersion =
    confirmingInstall === "preview" ? entry.npmPreview?.version : entry.version
  const selectedInstallSecurity =
    confirmingInstall === "preview" ? entry.npmPreviewSecurity : security
  const selectedInstallSecuritySummary = selectedInstallSecurity
    ? `${selectedInstallSecurity.blockingFindings} blocking · ${selectedInstallSecurity.advisoryFindings} advisory`
    : undefined
  const installable = command !== undefined
  const actionPending = installing || updatingId !== null
  const reportPluginUrl = getReportPluginIssueUrl(entry)
  const actionError = installations.length > 0 ? updateError : installError
  // The toggle and the clamp share one condition: a short error is never
  // clamped, so wrapping on a narrow screen cannot hide text with no way back.
  const actionErrorIsLong =
    actionError !== null &&
    (actionError.length > 240 || actionError.split("\n").length > 6)

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Paseo Cafe"
          style={styles.backRow}
          onPress={onBack}
        >
          <Icon name="ArrowLeft" size={ICON.md} color={theme.colors.accent} />
          <Text style={styles.backText}>Paseo Cafe</Text>
        </Pressable>

        <View style={styles.headerRow}>
          <Text style={styles.title}>{entry.name}</Text>
          {entry.scanError ? (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>needs attention</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.ownerRow}>
          {ownerMetadataMatchesRepository && entry.owner?.avatarUrl ? (
            <Image
              accessible={false}
              source={{ uri: entry.owner.avatarUrl }}
              style={styles.avatar}
            />
          ) : (
            <Icon
              name="Github"
              size={ICON.md}
              color={theme.colors.foregroundMuted}
            />
          )}
          <Text style={styles.ownerText}>by {repositoryOwner}</Text>
        </View>

        {descriptionNodes.length > 0 ? (
          <InlineMarkdown
            nodes={descriptionNodes}
            theme={theme}
            style={styles.description}
          />
        ) : null}

        {versionLabel || tags.length > 0 || entry.paseoVersionRequirement ? (
          <View style={styles.tagsRow}>
            {versionLabel ? (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{versionLabel}</Text>
              </View>
            ) : null}
            {entry.paseoVersionRequirement ? (
              <View style={styles.requirementTag}>
                <Text style={styles.requirementTagText}>
                  Paseo {entry.paseoVersionRequirement}
                </Text>
              </View>
            ) : null}
            {tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.metaRow}>
          {hasNpmMetrics ? (
            <View style={styles.metaItem}>
              <Icon
                name="Download"
                size={ICON.sm}
                color={theme.colors.foregroundMuted}
              />
              <Text style={styles.metaText}>
                {formatDirectoryDownloads(entry.npm.downloadsLast30Days)}
              </Text>
            </View>
          ) : entry.repoMeta?.stars !== undefined ? (
            <View style={styles.metaItem}>
              <Icon
                name="Star"
                size={ICON.sm}
                color={theme.colors.foregroundMuted}
              />
              <Text style={styles.metaText}>{entry.repoMeta.stars} stars</Text>
            </View>
          ) : null}
          {hasNpmMetrics ? (
            <Text style={styles.metaText}>
              Published {formatDirectoryDate(entry.npm.publishedAt)}
            </Text>
          ) : null}
          {entry.license ? (
            <Text style={styles.metaText}>License: {entry.license}</Text>
          ) : null}
          {entry.author ? (
            <Text style={styles.metaText}>By {entry.author}</Text>
          ) : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${entry.name} repository`}
            onPress={() => openExternal(repositoryUrl)}
          >
            <Text style={styles.linkText}>{entry.repo} ↗</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Open ${entry.name} on paseo.cafe`}
          style={styles.siteButton}
          onPress={() => openExternal(getSiteUrl(entry))}
        >
          <Icon
            name="ExternalLink"
            size={ICON.md}
            color={theme.colors.accentForeground}
          />
          <Text style={styles.siteButtonText}>View on paseo.cafe</Text>
        </Pressable>

        {!isOfficialPlugin(entry) ? (
          <View style={styles.alert}>
            <View style={styles.alertTitleRow}>
              <Icon
                name="AlertTriangle"
                size={ICON.sm}
                color={theme.colors.statusWarning}
              />
              <Text style={styles.alertTitle}>
                Community-submitted — not owned or vetted by paseo.cafe
              </Text>
            </View>
            <Text style={styles.alertBody}>
              This listing is generated automatically from the plugin's own
              public repository. Paseo plugins are trusted, unsandboxed code
              with filesystem, process, and network access — read the source at{" "}
              {entry.repo} before installing.
            </Text>
          </View>
        ) : null}

        {hasCaveatsSection ? (
          <View style={styles.alert}>
            <View style={styles.alertTitleRow}>
              <Icon
                name="AlertTriangle"
                size={ICON.sm}
                color={theme.colors.statusWarning}
              />
              <Text style={styles.alertTitle}>Caveats</Text>
            </View>
            {entry.platforms.length > 0 ? (
              <Text style={styles.alertBody}>
                Supported platforms:{" "}
                {entry.platforms
                  .map(
                    (platform) =>
                      DIRECTORY_PLATFORM_LABELS[
                        platform as keyof typeof DIRECTORY_PLATFORM_LABELS
                      ] ?? platform
                  )
                  .join(", ")}
                .
              </Text>
            ) : null}
            {entry.caveats.map((caveat, index) => (
              <Text key={caveat} style={styles.caveatLine}>
                {"⚠ "}
                <InlineMarkdown
                  nodes={directoryCaveatNodes(entry, index)}
                  theme={theme}
                />
              </Text>
            ))}
            {limitationsText ? (
              <>
                <Text style={styles.readmeLabel}>From the plugin's README</Text>
                <Text style={styles.readmeText}>{limitationsText}</Text>
              </>
            ) : null}
          </View>
        ) : null}
        {entry.themes.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.label}>Included themes</Text>
            <Text style={styles.alertBody}>
              Exact seed colors contributed to Paseo. Install this plugin, then
              select a theme in Settings → Appearance.
            </Text>
            <View style={styles.themeGrid}>
              {entry.themes.map((preview) => (
                <ThemePreviewCard
                  key={`${entry.id}-${preview.id}`}
                  entry={entry}
                  preview={preview}
                  theme={theme}
                  compact={compact}
                />
              ))}
            </View>
          </View>
        ) : null}

        {galleryImages.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.label}>Screenshots</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open screenshots gallery for ${entry.name}`}
              onPress={onOpenGallery}
              style={styles.gallery}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryContent}
              >
                {galleryImages.slice(0, 3).map((image) => (
                  <Image
                    key={image}
                    accessible={false}
                    source={{ uri: image }}
                    style={styles.galleryTile}
                  />
                ))}
              </ScrollView>
              <Text style={styles.errorActionText}>Open gallery</Text>
            </Pressable>
          </View>
        ) : null}

        {readmeText ? (
          <View style={styles.section}>
            <Text style={styles.label}>README</Text>
            <View style={styles.readmeHeaderRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showReadme
                    ? `Hide README for ${entry.name}`
                    : `Show README for ${entry.name}`
                }
                onPress={() => setShowReadme((current) => !current)}
                style={styles.errorAction}
              >
                <Icon
                  name={showReadme ? "ChevronUp" : "ChevronDown"}
                  size={ICON.sm}
                  color={theme.colors.accent}
                />
                <Text style={styles.errorActionText}>
                  {showReadme ? "Hide text" : "View raw text"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Copy README text for ${entry.name}`}
                onPress={async () => {
                  const text = readmeText
                  if (text === undefined) return
                  await copyText(text)
                  toast.show("Copied README text")
                }}
                style={styles.errorAction}
              >
                <Icon name="Copy" size={ICON.sm} color={theme.colors.accent} />
                <Text style={styles.errorActionText}>Copy text</Text>
              </Pressable>
            </View>
            {showReadme ? (
              <View style={styles.readmeViewer}>
                <Text selectable style={styles.readmeText}>
                  {readmeText}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {entry.scanError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{entry.scanError}</Text>
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.label}>Install</Text>
          <View style={styles.commandRow}>
            <Text style={styles.command}>
              {command ?? "Unavailable: invalid repository or plugin path"}
            </Text>
            {command ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy install command"
                style={styles.copyButton}
                onPress={async () => {
                  await copyText(command)
                  toast.show("Copied install command")
                }}
              >
                <Icon
                  name="Copy"
                  size={ICON.md}
                  color={theme.colors.foreground}
                />
              </Pressable>
            ) : null}
          </View>
          {installNotesText ? (
            <>
              <Text style={styles.readmeLabel}>From the plugin's README</Text>
              <Text style={styles.readmeText}>{installNotesText}</Text>
            </>
          ) : null}
        </View>

        {manifestText ? (
          <ExpandableSection
            title="Paseo manifest"
            subtitle="Pretty-printed JSON"
            theme={theme}
          >
            <View style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy manifest JSON"
                onPress={async () => {
                  await copyText(manifestText)
                  toast.show("Copied manifest JSON")
                }}
                style={styles.errorAction}
              >
                <Icon name="Copy" size={ICON.sm} color={theme.colors.accent} />
                <Text style={styles.errorActionText}>Copy JSON</Text>
              </Pressable>
              <View style={styles.manifestViewer}>
                <Text selectable style={styles.manifestText}>
                  {manifestText}
                </Text>
              </View>
            </View>
          </ExpandableSection>
        ) : null}

        {!inventoryAvailable ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>
              Installed plugin status unavailable
            </Text>
            <Text style={styles.alertBody}>
              Install and update actions are disabled until Paseo can read this
              host's plugin inventory.
            </Text>
          </View>
        ) : null}

        {installations.length > 0 ? (
          <View style={styles.installationList}>
            <Text style={styles.label}>Installations</Text>
            {installations.map((installation) => {
              const isNpm = installation.source === "npm"
              const isPreview =
                isNpm &&
                (installation.releaseChannel === "preview" ||
                  (!installation.releaseChannel &&
                    installation.version === entry.npmPreview?.version))
              const stableAvailable = isNpm
                ? installation.version !== entry.version
                : installation.updateState === "available"
              const stableUpdateCommand = getUpdateCommand(
                installation,
                entry,
                "stable"
              )
              const previewUpdateCommand = getUpdateCommand(
                installation,
                entry,
                "preview"
              )
              const previewAvailable = Boolean(
                previewUpdateCommand &&
                  isPreviewUpdateAvailable(installation, entry, isPreview)
              )
              return (
                <View key={installation.id} style={styles.installationCard}>
                  <Text style={styles.installationTitle}>
                    {isPreview
                      ? "Installed from npm (preview)"
                      : getInstallationStateLabel(installation)}{" "}
                    · {installation.id}
                  </Text>
                  <Text selectable style={styles.metaText}>
                    {installation.remote ??
                      installation.packageName ??
                      installation.path}
                    {installation.ref ? ` · ${installation.ref}` : ""}
                    {installation.version ? ` · ${installation.version}` : ""}
                    {installation.commit
                      ? ` · ${installation.commit.slice(0, 12)}`
                      : ""}
                    {installation.latestCommit
                      ? ` → ${installation.latestCommit.slice(0, 12)}`
                      : ""}
                  </Text>
                  {installation.updateError ? (
                    <Text style={styles.errorText}>
                      {installation.updateError}
                    </Text>
                  ) : null}
                  {stableAvailable || previewAvailable ? (
                    <View style={styles.actionsRow}>
                      {stableAvailable && stableUpdateCommand ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${isPreview ? "Return" : "Update"} ${entry.name} installation ${installation.id} to stable ${entry.version ?? "version"}`}
                          accessibilityState={{ disabled: actionPending }}
                          disabled={actionPending}
                          style={styles.button}
                          onPress={() =>
                            setConfirmingUpdate({
                              installation,
                              channel: "stable",
                            })
                          }
                        >
                          <Text style={styles.buttonText}>
                            {updatingId === installation.id
                              ? "Updating…"
                              : isPreview
                                ? `Return to stable ${versionLabel ?? ""}`.trim()
                                : `Update to stable ${versionLabel ?? ""}`.trim()}
                          </Text>
                        </Pressable>
                      ) : null}
                      {previewAvailable && entry.npmPreview ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Update ${entry.name} installation ${installation.id} to Preview ${entry.npmPreview.version}`}
                          accessibilityState={{ disabled: actionPending }}
                          disabled={actionPending}
                          style={styles.secondaryButton}
                          onPress={() =>
                            setConfirmingUpdate({
                              installation,
                              channel: "preview",
                            })
                          }
                        >
                          <Text style={styles.secondaryButtonText}>
                            {updatingId === installation.id
                              ? "Updating…"
                              : isPreview
                                ? `Update preview to v${entry.npmPreview.version}`
                                : `Use preview v${entry.npmPreview.version}`}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {inventoryAvailable && installations.length === 0 ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Review stable ${entry.name} before installing`}
                accessibilityState={{ disabled: actionPending || !installable }}
                style={[styles.button, !installable ? { opacity: 0.5 } : null]}
                disabled={actionPending || !installable}
                onPress={() => setConfirmingInstall("stable")}
              >
                <Text style={styles.buttonText}>
                  {installing ? "Installing…" : "Review & install"}
                </Text>
              </Pressable>
              {previewCommand ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Review Preview ${entry.npmPreview?.version ?? "version"} of ${entry.name} before installing`}
                  accessibilityState={{ disabled: actionPending }}
                  disabled={actionPending}
                  style={styles.secondaryButton}
                  onPress={() => setConfirmingInstall("preview")}
                >
                  <Text style={styles.secondaryButtonText}>
                    Review Preview v{entry.npmPreview?.version}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${entry.name} repository`}
            style={styles.secondaryButton}
            onPress={() => openExternal(repositoryUrl)}
          >
            <Text style={styles.secondaryButtonText}>View repository</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Report ${entry.name} on GitHub`}
            style={styles.secondaryButton}
            onPress={() => openExternal(reportPluginUrl)}
          >
            <Text style={styles.secondaryButtonText}>Report plugin</Text>
          </Pressable>
        </View>

        {inventoryAvailable && installations.length === 0 && !installable ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>
              Exact install target unavailable. Refresh after the next
              successful catalog scan.
            </Text>
          </View>
        ) : null}

        {actionError ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>
              {installations.length > 0
                ? "Update failed"
                : "Installation failed"}
            </Text>
            <Text
              numberOfLines={
                actionErrorIsLong && !showFullActionError ? 6 : undefined
              }
              selectable
              style={styles.errorDetails}
            >
              {actionError}
            </Text>
            <View style={styles.errorActions}>
              {actionErrorIsLong ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showFullActionError
                      ? "Show less action error output"
                      : "View full action error output"
                  }
                  onPress={() => setShowFullActionError((current) => !current)}
                  style={styles.errorAction}
                >
                  <Icon
                    name={showFullActionError ? "ChevronUp" : "ChevronDown"}
                    size={ICON.sm}
                    color={theme.colors.accent}
                  />
                  <Text style={styles.errorActionText}>
                    {showFullActionError ? "Show less" : "View more…"}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy action error output"
                onPress={async () => {
                  await copyText(actionError)
                  toast.show("Copied action error output")
                }}
                style={styles.errorAction}
              >
                <Icon name="Copy" size={ICON.sm} color={theme.colors.accent} />
                <Text style={styles.errorActionText}>Copy error</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <ExpandableSection
          title="Security scan"
          subtitle={securityStatusLabel}
          theme={theme}
        >
          <View style={styles.alert}>
            <View style={styles.alertTitleRow}>
              <Icon
                name={
                  securityStatus === "passed"
                    ? "Check"
                    : securityStatus === "failed"
                      ? "X"
                      : "AlertTriangle"
                }
                size={ICON.sm}
                color={securityStatusColor}
              />
              <Text style={[styles.alertTitle, { color: securityStatusColor }]}>
                Security scan: {securityStatusLabel}
              </Text>
            </View>
            {!securityAttestation ? (
              <Text style={styles.alertBody}>
                No published security scan is available for this plugin yet.
              </Text>
            ) : (
              <>
                <Text style={styles.alertBody}>
                  Blocking findings: {securityAttestation.blockingFindings} ·
                  Advisory findings: {securityAttestation.advisoryFindings}
                </Text>
                <Text selectable style={styles.alertBody}>
                  Scanned {securityScannedDate ?? "Unknown"}
                  {securityCommit ? ` at commit ${securityCommit}` : ""}.
                </Text>
                {securityReportUrl ? (
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={`Open security report for ${entry.name}`}
                    style={styles.errorAction}
                    onPress={() => openExternal(securityReportUrl)}
                  >
                    <Icon
                      name="ExternalLink"
                      size={ICON.sm}
                      color={theme.colors.accent}
                    />
                    <Text style={styles.errorActionText}>Open report</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </ExpandableSection>

        {health ? (
          <ExpandableSection
            title="Health checks"
            subtitle={healthSummary}
            theme={theme}
          >
            <View style={styles.healthGrid}>
              {HEALTH_KEYS.map((key) => {
                const label = HEALTH_LABELS[key]
                const ok = health[key] === true
                return (
                  <View key={key} style={styles.healthItem}>
                    <Icon
                      name={ok ? "Check" : "X"}
                      size={ICON.sm}
                      color={
                        ok
                          ? theme.colors.statusSuccess
                          : theme.colors.foregroundMuted
                      }
                    />
                    <Text
                      style={[
                        styles.healthText,
                        {
                          color: ok
                            ? theme.colors.foreground
                            : theme.colors.foregroundMuted,
                        },
                      ]}
                    >
                      {label}
                    </Text>
                  </View>
                )
              })}
            </View>
          </ExpandableSection>
        ) : null}

        {entry.scannedAt ? (
          <Text style={styles.footer}>
            Scanned {entry.scannedAt.slice(0, 10)} from {entry.repo}
            {entry.path ? `/${entry.path}` : ""}.
          </Text>
        ) : null}
      </ScrollView>
      <Modal
        title={`Review ${entry.name} ${confirmingInstall === "preview" ? "Preview" : "stable"} installation`}
        icon={
          <Icon name="Download" size={ICON.md} color={theme.colors.accent} />
        }
        open={confirmingInstall !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setConfirmingInstall(null)
        }}
      >
        <Modal.Content contentContainerStyle={styles.modalBody}>
          <View style={styles.section}>
            <Text style={styles.label}>Source repository</Text>
            <Text selectable style={styles.modalText}>
              {repositoryUrl}
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Install command</Text>
            <View style={styles.commandRow}>
              <Text selectable style={styles.command}>
                {selectedInstallCommand ??
                  "Unavailable: invalid catalog target"}
              </Text>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Catalog status</Text>
            {confirmingInstall === "preview" ? (
              <Text style={styles.modalText}>
                Preview {entry.package}@{selectedInstallVersion} comes from npm
                dist-tag: next and may contain unreleased changes.
              </Text>
            ) : installingFromNpm ? (
              <Text style={styles.modalText}>
                Stable package: {entry.package}@{selectedInstallVersion}. Paseo
                resolves it through this host&apos;s npm configuration.
              </Text>
            ) : null}
            {!installingFromNpm && securityCommit ? (
              <Text style={styles.modalText}>
                Paseo Cafe installs the exact scanned commit{" "}
                {securityCommit.slice(0, 12)}.
              </Text>
            ) : null}
            {catalogScannedDate ? (
              <Text style={styles.modalText}>
                Catalog scanned: {catalogScannedDate}
              </Text>
            ) : null}
            <Text style={styles.modalText}>Health: {healthSummary}</Text>
            {selectedInstallSecuritySummary ? (
              <Text style={styles.modalText}>
                Security: {selectedInstallSecurity?.status ?? "unknown"} ·{" "}
                {selectedInstallSecuritySummary}
              </Text>
            ) : (
              <Text style={styles.modalText}>
                Security: No published security scan is available for this
                plugin yet.
              </Text>
            )}
          </View>
          <View style={styles.alert}>
            <View style={styles.alertTitleRow}>
              <Icon
                name="AlertTriangle"
                size={ICON.sm}
                color={theme.colors.statusWarning}
              />
              <Text style={styles.alertTitle}>Trusted, unsandboxed code</Text>
            </View>
            <Text style={styles.alertBody}>
              Plugin server code, build commands, dependencies, and future
              updates run as trusted code on the Paseo host. Review the source
              before installing.
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Caveats</Text>
            {entry.paseoVersionRequirement ? (
              <Text style={styles.alertBody}>
                Requires Paseo {entry.paseoVersionRequirement}.
              </Text>
            ) : null}
            {entry.platforms.length > 0 ? (
              <Text style={styles.alertBody}>
                Supported platforms: {entry.platforms.join(", ")}.
              </Text>
            ) : null}
            {entry.caveats.map((caveat, index) => (
              <Text key={caveat} style={styles.caveatLine}>
                {"⚠ "}
                <InlineMarkdown
                  nodes={directoryCaveatNodes(entry, index)}
                  theme={theme}
                />
              </Text>
            ))}
            {limitationsText ? (
              <Text style={styles.readmeText}>{limitationsText}</Text>
            ) : null}
            {!hasCaveatsSection && !entry.paseoVersionRequirement ? (
              <Text style={styles.modalText}>No catalog caveats reported.</Text>
            ) : null}
          </View>
          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${entry.name} repository`}
              style={styles.secondaryButton}
              onPress={() => openExternal(repositoryUrl)}
            >
              <Text style={styles.secondaryButtonText}>View repository</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel installation"
              style={styles.secondaryButton}
              onPress={() => setConfirmingInstall(null)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Confirm ${confirmingInstall ?? "stable"} installation of ${entry.name}`}
              accessibilityState={{
                disabled: actionPending || selectedInstallCommand === undefined,
              }}
              style={[
                styles.button,
                selectedInstallCommand === undefined ? { opacity: 0.5 } : null,
              ]}
              disabled={actionPending || selectedInstallCommand === undefined}
              onPress={() => {
                if (
                  actionPending ||
                  !confirmingInstall ||
                  !selectedInstallCommand
                )
                  return
                const channel = confirmingInstall
                setConfirmingInstall(null)
                onInstall(channel)
              }}
            >
              <Text style={styles.buttonText}>
                {installing
                  ? "Installing…"
                  : confirmingInstall === "preview"
                    ? "Install preview"
                    : "Install stable"}
              </Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
      <Modal
        title={`${confirmingUpdate?.channel === "preview" ? "Use Preview for" : "Use stable for"} ${entry.name}?`}
        icon={
          <Icon name="RefreshCw" size={ICON.md} color={theme.colors.accent} />
        }
        open={confirmingUpdate !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setConfirmingUpdate(null)
        }}
      >
        <Modal.Content contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalTitle}>
            {confirmingUpdate?.installation.id}
          </Text>
          <Text selectable style={styles.modalText}>
            {updateReview?.identity}
          </Text>
          <Text selectable style={styles.modalText}>
            {updateReview?.revision}
          </Text>
          <Text style={styles.modalText}>
            {confirmingUpdate?.channel === "preview"
              ? `This installs the scanned Preview from npm dist-tag: next.`
              : confirmingUpdate?.installation.releaseChannel === "preview" ||
                  confirmingUpdate?.installation.version ===
                    entry.npmPreview?.version
                ? "This leaves the Preview channel. An older stable version may not read state written by Preview."
                : "This installs the current stable release."}
          </Text>
          <Text style={styles.modalText}>
            Updating replaces trusted, unsandboxed plugin code on this Paseo
            host. Review the source before continuing.
          </Text>
          {updateReview ? (
            <Text style={styles.modalText}>{updateReview.review}</Text>
          ) : null}
          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${entry.name} repository`}
              style={styles.secondaryButton}
              onPress={() => openExternal(updateRepositoryUrl)}
            >
              <Text style={styles.secondaryButtonText}>View repository</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel update"
              style={styles.secondaryButton}
              onPress={() => setConfirmingUpdate(null)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Confirm ${confirmingUpdate?.channel ?? "stable"} update of ${entry.name}`}
              accessibilityState={{ disabled: actionPending }}
              disabled={actionPending}
              style={styles.button}
              onPress={() => {
                if (confirmingUpdate) {
                  onUpdate(
                    confirmingUpdate.installation,
                    confirmingUpdate.channel
                  )
                }
                setConfirmingUpdate(null)
              }}
            >
              <Text style={styles.buttonText}>
                {updatingId ? "Updating…" : "Update"}
              </Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  )
}
