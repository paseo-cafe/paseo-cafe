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
import type {
  DirectoryCategory,
  DirectoryEntry,
  InstalledPlugin,
} from "../shared/directory"
import {
  DIRECTORY_CATEGORY_LABELS,
  DIRECTORY_PLATFORM_LABELS,
  formatDirectoryDate,
  formatDirectoryVersion,
  getInstallCommand,
  getInstallRef,
  getReportPluginIssueUrl,
  getRepositoryOwner,
  getRepositoryUrl,
  getRepositoryUrlAtRef,
  getSiteUrl,
  HEALTH_KEYS,
  HEALTH_LABELS,
  isOfficialPlugin,
  stripHtml,
} from "../shared/directory"
import { ExpandableSection } from "./ExpandableSection"
import { CAFE_CONTROL_RADIUS, CAFE_MONO_FONT } from "./visual"
import { openExternal } from "./web"

interface PluginDetailPageProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  installations: readonly InstalledPlugin[]
  inventoryAvailable: boolean
  installing: boolean
  updatingId: string | null
  installError: string | null
  updateError: string | null
  onInstall: () => void
  onUpdate: (installation: InstalledPlugin) => void
  onOpenGallery: () => void
  onBack: () => void
}

/** "2026-09-08T01:09:51Z" -> "08 Sep 2026", the same rendering the website uses. */
function formatDate(iso: string | undefined): string | undefined {
  return iso ? formatDirectoryDate(iso) : undefined
}

function installationStateLabel(installation: InstalledPlugin): string {
  if (installation.source === "directory") return "Installed locally"
  if (installation.updateState === "available") return "Update available"
  if (installation.updateState === "current") return "Up to date"
  if (installation.updateState === "pinned") return "Pinned"
  if (installation.updateState === "diverged") return "Source diverged"
  return "Update status unavailable"
}

export function PluginDetailPage({
  entry,
  theme,
  compact,
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
  const [confirmingInstall, setConfirmingInstall] = useState(false)
  const [confirmingUpdate, setConfirmingUpdate] =
    useState<InstalledPlugin | null>(null)
  const [showFullActionError, setShowFullActionError] = useState(false)
  const [showReadme, setShowReadme] = useState(false)

  const manifestText = useMemo(
    () =>
      entry.manifest === undefined
        ? undefined
        : JSON.stringify(entry.manifest, null, 2),
    [entry.manifest]
  )
  const readmeText = entry.readmeText?.length ? entry.readmeText : undefined

  const styles = useMemo(
    () => ({
      screen: { flex: 1, backgroundColor: theme.colors.surface0 },
      content: {
        width: "100%" as const,
        maxWidth: 960,
        alignSelf: "center" as const,
        padding: compact ? 16 : 24,
        gap: 16,
      },
      backRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        marginBottom: 4,
      },
      backText: {
        color: theme.colors.accent,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 14,
      },
      headerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        flexWrap: "wrap" as const,
      },
      ownerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
      },
      avatar: { width: 20, height: 20, borderRadius: 10 },
      ownerText: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
      },
      title: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: compact ? 22 : 28,
        fontWeight: "700" as const,
        letterSpacing: -0.6,
        flexShrink: 1,
      },
      errorBadge: {
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.statusDanger,
      },
      errorBadgeText: {
        color: theme.colors.accentForeground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
      },
      description: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 14,
        lineHeight: 20,
      },
      tagsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
      },
      tag: {
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface2,
      },
      tagText: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
      },
      requirementTag: {
        borderRadius: CAFE_CONTROL_RADIUS,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.accent,
      },
      requirementTagText: {
        color: theme.colors.accentForeground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
      },
      metaRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 14,
        alignItems: "center" as const,
      },
      metaItem: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
      },
      metaText: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
      },
      linkText: {
        color: theme.colors.accent,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
      },
      siteButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        alignSelf: "flex-start" as const,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: CAFE_CONTROL_RADIUS,
        backgroundColor: theme.colors.accent,
      },
      siteButtonText: {
        color: theme.colors.accentForeground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 15,
        fontWeight: "700" as const,
      },
      alert: {
        gap: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: 12,
        backgroundColor: theme.colors.surface1,
      },
      alertTitleRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
      },
      alertTitle: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        fontWeight: "600" as const,
      },
      alertBody: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        lineHeight: 19,
      },
      caveatLine: {
        color: theme.colors.statusWarning,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        lineHeight: 18,
      },
      readmeLabel: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 10,
        fontWeight: "600" as const,
        textTransform: "uppercase" as const,
        letterSpacing: 0.8,
        marginTop: 8,
        marginBottom: 4,
      },
      readmeText: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        lineHeight: 18,
      },
      errorBox: {
        borderWidth: 1,
        borderColor: theme.colors.statusDanger,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: 12,
        gap: 8,
        backgroundColor: theme.colors.surface1,
      },
      errorText: {
        color: theme.colors.statusDanger,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
      },
      errorDetails: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        lineHeight: 18,
      },
      errorActions: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 14,
      },
      errorAction: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 5,
      },
      errorActionText: {
        color: theme.colors.accent,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        fontWeight: "600" as const,
      },
      gallery: { marginHorizontal: compact ? -16 : -24 },
      galleryContent: { paddingHorizontal: compact ? 16 : 24, gap: 10 },
      galleryTile: {
        width: compact ? 220 : 280,
        aspectRatio: 16 / 9,
        borderRadius: CAFE_CONTROL_RADIUS,
        backgroundColor: theme.colors.surface2,
      },
      section: { gap: 6 },
      label: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
        fontWeight: "600" as const,
        textTransform: "uppercase" as const,
        letterSpacing: 0.8,
      },
      commandRow: {
        flexDirection: "row" as const,
        alignItems: "stretch" as const,
        gap: 8,
      },
      command: {
        flex: 1,
        fontFamily: CAFE_MONO_FONT,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: 10,
        fontSize: 12,
      },
      copyButton: {
        alignItems: "center" as const,
        justifyContent: "center" as const,
        paddingHorizontal: 12,
        borderRadius: CAFE_CONTROL_RADIUS,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      actionsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      button: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: CAFE_CONTROL_RADIUS,
        backgroundColor: theme.colors.accent,
        opacity: installing || updatingId !== null ? 0.6 : 1,
      },
      buttonText: {
        color: theme.colors.accentForeground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 14,
        fontWeight: "600" as const,
      },
      manifestViewer: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: 12,
        backgroundColor: theme.colors.surface1,
      },
      manifestText: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 12,
        lineHeight: 18,
      },
      readmeHeaderRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      readmeViewer: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: 12,
        backgroundColor: theme.colors.surface1,
      },
      secondaryButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: CAFE_CONTROL_RADIUS,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryButtonText: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 14,
      },
      installationList: { gap: 8 },
      installationCard: {
        gap: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: CAFE_CONTROL_RADIUS,
        padding: 10,
        backgroundColor: theme.colors.surface1,
      },
      installationTitle: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        fontWeight: "600" as const,
      },
      healthGrid: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 10,
      },
      healthItem: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        width: compact ? ("100%" as const) : ("48%" as const),
      },
      healthText: { fontFamily: CAFE_MONO_FONT, fontSize: 13 },
      footer: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 11,
      },
      modalBody: { gap: 16 },
      modalTitle: {
        color: theme.colors.foreground,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 15,
        fontWeight: "600" as const,
      },
      modalText: {
        color: theme.colors.foregroundMuted,
        fontFamily: CAFE_MONO_FONT,
        fontSize: 13,
        lineHeight: 19,
      },
    }),
    [theme, compact, installing, updatingId]
  )

  const command = getInstallCommand(entry)
  const installRef = getInstallRef(entry.repoMeta?.defaultBranch)
  const repositoryUrl = getRepositoryUrl(entry)
  const updateRepositoryUrl = confirmingUpdate?.latestCommit
    ? getRepositoryUrlAtRef(entry, confirmingUpdate.latestCommit)
    : repositoryUrl
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
  const limitationsText = entry.limitationsNotesHtml
    ? stripHtml(entry.limitationsNotesHtml)
    : undefined
  const installNotesText = entry.installNotesHtml
    ? stripHtml(entry.installNotesHtml)
    : undefined
  const hasCaveatsSection =
    entry.platforms.length > 0 || entry.caveats.length > 0 || !!limitationsText
  const health = entry.health
  const security = entry.security
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
  const securityFindingsSummary = securityAttestation
    ? `${securityAttestation.blockingFindings} blocking · ${securityAttestation.advisoryFindings} advisory`
    : undefined
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
  const sourceUpdatedDate = formatDate(entry.repoMeta?.pushedAt)
  const catalogScannedDate = formatDate(entry.scannedAt)
  const securityScannedDate = formatDate(securityAttestation?.scannedAt)
  const securityReportUrl = securityAttestation?.reportUrl
  const missingAttestationBranch =
    securityAttestation?.commit !== undefined && installRef === undefined
  const installable = command !== undefined && !missingAttestationBranch
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
          <Icon name="ArrowLeft" size={16} color={theme.colors.accent} />
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
              size={16}
              color={theme.colors.foregroundMuted}
            />
          )}
          <Text style={styles.ownerText}>by {repositoryOwner}</Text>
        </View>

        {entry.description ? (
          <Text style={styles.description}>{entry.description}</Text>
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
          {entry.repoMeta?.stars !== undefined ? (
            <View style={styles.metaItem}>
              <Icon
                name="Star"
                size={13}
                color={theme.colors.foregroundMuted}
              />
              <Text style={styles.metaText}>{entry.repoMeta.stars} stars</Text>
            </View>
          ) : null}
          {entry.license ? (
            <Text style={styles.metaText}>License: {entry.license}</Text>
          ) : null}
          {entry.author ? (
            <Text style={styles.metaText}>By {entry.author}</Text>
          ) : null}
          {formatDate(entry.repoMeta?.pushedAt) ? (
            <Text style={styles.metaText}>
              Last updated {formatDate(entry.repoMeta?.pushedAt)}
            </Text>
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
            size={16}
            color={theme.colors.accentForeground}
          />
          <Text style={styles.siteButtonText}>View on paseo.cafe</Text>
        </Pressable>

        {!isOfficialPlugin(entry) ? (
          <View style={styles.alert}>
            <View style={styles.alertTitleRow}>
              <Icon
                name="AlertTriangle"
                size={14}
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
                size={14}
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
            {entry.caveats.map((caveat) => (
              <Text key={caveat} style={styles.caveatLine}>
                ⚠ {caveat}
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

        {entry.images.length > 0 ? (
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
                {entry.images.slice(0, 3).map((image) => (
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
                  size={14}
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
                <Icon name="Copy" size={14} color={theme.colors.accent} />
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
                <Icon name="Copy" size={16} color={theme.colors.foreground} />
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
                <Icon name="Copy" size={14} color={theme.colors.accent} />
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
              const updateCommand = `paseo plugin update ${installation.id}`
              return (
                <View key={installation.id} style={styles.installationCard}>
                  <Text style={styles.installationTitle}>
                    {installationStateLabel(installation)} · {installation.id}
                  </Text>
                  <Text selectable style={styles.metaText}>
                    {installation.remote ?? installation.path}
                    {installation.ref ? ` · ${installation.ref}` : ""}
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
                  {installation.updateState === "available" ? (
                    entry.id === "paseo-cafe" ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Copy update command for ${installation.id}`}
                        style={styles.secondaryButton}
                        onPress={async () => {
                          await copyText(updateCommand)
                          toast.show("Copied update command")
                        }}
                      >
                        <Text style={styles.secondaryButtonText}>
                          Copy update command
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Update ${entry.name} installation ${installation.id}`}
                        accessibilityState={{ disabled: actionPending }}
                        style={styles.button}
                        disabled={actionPending}
                        onPress={() => setConfirmingUpdate(installation)}
                      >
                        <Text style={styles.buttonText}>
                          {updatingId === installation.id
                            ? "Updating…"
                            : "Update"}
                        </Text>
                      </Pressable>
                    )
                  ) : null}
                </View>
              )
            })}
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          {inventoryAvailable && installations.length === 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Review ${entry.name} before installing`}
              accessibilityState={{ disabled: actionPending || !installable }}
              style={[styles.button, !installable ? { opacity: 0.5 } : null]}
              disabled={actionPending || !installable}
              onPress={() => setConfirmingInstall(true)}
            >
              <Text style={styles.buttonText}>
                {installing ? "Installing…" : "Review & install"}
              </Text>
            </Pressable>
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
              {missingAttestationBranch
                ? "This security-attested listing lacks valid branch metadata. Refresh or update the catalog before installing."
                : "This listing has an invalid repository or plugin subpath and cannot be installed."}
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
                    size={14}
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
                <Icon name="Copy" size={14} color={theme.colors.accent} />
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
                size={14}
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
                  {securityAttestation.commit
                    ? ` at commit ${securityAttestation.commit}`
                    : ""}
                  .
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
                      size={14}
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
                      size={14}
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
        title={`Review ${entry.name} installation`}
        icon={<Icon name="Download" size={18} color={theme.colors.accent} />}
        open={confirmingInstall}
        onOpenChange={setConfirmingInstall}
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
                {command ?? "Unavailable: invalid catalog target"}
              </Text>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Freshness and status</Text>
            {securityAttestation?.commit && installRef ? (
              <Text style={styles.modalText}>
                Before installation, Paseo Cafe verifies that {installRef} still
                points to scanned commit{" "}
                {securityAttestation.commit.slice(0, 12)}.
              </Text>
            ) : null}
            {sourceUpdatedDate ? (
              <Text style={styles.modalText}>
                Repository updated: {sourceUpdatedDate}
              </Text>
            ) : null}
            {catalogScannedDate ? (
              <Text style={styles.modalText}>
                Catalog scanned: {catalogScannedDate}
              </Text>
            ) : null}
            <Text style={styles.modalText}>Health: {healthSummary}</Text>
            {securityFindingsSummary ? (
              <Text style={styles.modalText}>
                Security: {securityStatusLabel} · {securityFindingsSummary}
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
                size={14}
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
            {entry.caveats.map((caveat) => (
              <Text key={caveat} style={styles.caveatLine}>
                ⚠ {caveat}
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
              onPress={() => setConfirmingInstall(false)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Confirm installation of ${entry.name}`}
              accessibilityState={{ disabled: actionPending || !installable }}
              style={[styles.button, !installable ? { opacity: 0.5 } : null]}
              disabled={actionPending || !installable}
              onPress={() => {
                if (actionPending || !installable) return
                setConfirmingInstall(false)
                onInstall()
              }}
            >
              <Text style={styles.buttonText}>
                {installing ? "Installing…" : "Install"}
              </Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
      <Modal
        title={`Update ${entry.name}?`}
        icon={<Icon name="RefreshCw" size={18} color={theme.colors.accent} />}
        open={confirmingUpdate !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setConfirmingUpdate(null)
        }}
      >
        <Modal.Content contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalTitle}>{confirmingUpdate?.id}</Text>
          <Text selectable style={styles.modalText}>
            {confirmingUpdate?.remote}
            {confirmingUpdate?.ref ? ` · ${confirmingUpdate.ref}` : ""}
          </Text>
          <Text selectable style={styles.modalText}>
            {confirmingUpdate?.commit?.slice(0, 12)} →{" "}
            {confirmingUpdate?.latestCommit?.slice(0, 12)}
          </Text>
          <Text style={styles.modalText}>
            Updating replaces trusted, unsandboxed plugin code on this Paseo
            host. Review the source before continuing.
          </Text>
          {confirmingUpdate?.latestCommit ? (
            <Text style={styles.modalText}>
              Review commit {confirmingUpdate.latestCommit.slice(0, 12)} before
              updating.
            </Text>
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
              style={styles.secondaryButton}
              onPress={() => setConfirmingUpdate(null)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                if (confirmingUpdate) onUpdate(confirmingUpdate)
                setConfirmingUpdate(null)
              }}
            >
              <Text style={styles.buttonText}>Update</Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  )
}
