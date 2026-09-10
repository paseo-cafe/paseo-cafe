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
import type { DirectoryEntry, InstalledPlugin } from "../shared/directory"
import {
  getInstallCommand,
  getReportPluginIssueUrl,
  getSiteUrl,
  HEALTH_LABELS,
  isValidInstallPath,
  isValidRepo,
  stripHtml,
} from "../shared/directory"
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

/** "2026-09-08T01:09:51Z" -> "2026-09-08". No Intl formatting — good enough for a byline. */
function formatDate(iso: string | undefined): string | undefined {
  return iso ? iso.slice(0, 10) : undefined
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
  const [showManifest, setShowManifest] = useState(false)
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
      content: { padding: compact ? 16 : 24, gap: 16, maxWidth: 860 },
      backRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 4,
        marginBottom: 4,
      },
      backText: { color: theme.colors.accent, fontSize: 14 },
      headerRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 10,
        flexWrap: "wrap" as const,
      },
      avatar: { width: 32, height: 32, borderRadius: 16 },
      title: {
        color: theme.colors.foreground,
        fontSize: compact ? 22 : 28,
        fontWeight: "700" as const,
        flexShrink: 1,
      },
      errorBadge: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.statusDanger,
      },
      errorBadgeText: {
        color: theme.colors.accentForeground,
        fontSize: 11,
        fontWeight: "600" as const,
      },
      description: {
        color: theme.colors.foregroundMuted,
        fontSize: 14,
        lineHeight: 20,
      },
      tagsRow: {
        flexDirection: "row" as const,
        flexWrap: "wrap" as const,
        gap: 6,
      },
      tag: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.surface2,
      },
      tagText: { color: theme.colors.foregroundMuted, fontSize: 11 },
      requirementTag: {
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        backgroundColor: theme.colors.accent,
      },
      requirementTagText: {
        color: theme.colors.accentForeground,
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
      metaText: { color: theme.colors.foregroundMuted, fontSize: 12 },
      linkText: { color: theme.colors.accent, fontSize: 12 },
      siteButton: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        gap: 6,
        alignSelf: "flex-start" as const,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: theme.colors.accent,
      },
      siteButtonText: {
        color: theme.colors.accentForeground,
        fontSize: 15,
        fontWeight: "700" as const,
      },
      alert: {
        gap: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 10,
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
        fontSize: 13,
        fontWeight: "600" as const,
      },
      alertBody: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 19,
      },
      caveatLine: {
        color: theme.colors.statusWarning,
        fontSize: 13,
        lineHeight: 18,
      },
      readmeLabel: {
        color: theme.colors.foregroundMuted,
        fontSize: 10,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
        marginTop: 8,
        marginBottom: 4,
      },
      readmeText: {
        color: theme.colors.foregroundMuted,
        fontSize: 12,
        lineHeight: 18,
        fontFamily: "monospace" as const,
      },
      errorBox: {
        borderWidth: 1,
        borderColor: theme.colors.statusDanger,
        borderRadius: 10,
        padding: 12,
        gap: 8,
        backgroundColor: theme.colors.surface1,
      },
      errorText: { color: theme.colors.statusDanger, fontSize: 13 },
      errorDetails: {
        color: theme.colors.foreground,
        fontFamily: "monospace" as const,
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
        fontSize: 12,
        fontWeight: "600" as const,
      },
      gallery: { marginHorizontal: compact ? -16 : -24 },
      galleryContent: { paddingHorizontal: compact ? 16 : 24, gap: 10 },
      galleryTile: {
        width: compact ? 220 : 280,
        aspectRatio: 16 / 9,
        borderRadius: 10,
        backgroundColor: theme.colors.surface2,
      },
      section: { gap: 6 },
      label: {
        color: theme.colors.foregroundMuted,
        fontSize: 11,
        textTransform: "uppercase" as const,
        letterSpacing: 0.5,
      },
      commandRow: {
        flexDirection: "row" as const,
        alignItems: "stretch" as const,
        gap: 8,
      },
      command: {
        flex: 1,
        fontFamily: "monospace" as const,
        color: theme.colors.foreground,
        backgroundColor: theme.colors.surface1,
        borderRadius: 8,
        padding: 10,
        fontSize: 12,
      },
      copyButton: {
        alignItems: "center" as const,
        justifyContent: "center" as const,
        paddingHorizontal: 12,
        borderRadius: 8,
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
        borderRadius: 8,
        backgroundColor: theme.colors.accent,
        opacity: installing || updatingId !== null ? 0.6 : 1,
      },
      buttonText: {
        color: theme.colors.accentForeground,
        fontSize: 14,
        fontWeight: "600" as const,
      },
      manifestHeaderRow: {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        flexWrap: "wrap" as const,
        gap: 8,
      },
      manifestViewer: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 12,
        backgroundColor: theme.colors.surface1,
      },
      manifestText: {
        color: theme.colors.foreground,
        fontFamily: "monospace" as const,
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
        borderRadius: 8,
        padding: 12,
        backgroundColor: theme.colors.surface1,
      },
      secondaryButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryButtonText: { color: theme.colors.foreground, fontSize: 14 },
      installationList: { gap: 8 },
      installationCard: {
        gap: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: 10,
        backgroundColor: theme.colors.surface1,
      },
      installationTitle: {
        color: theme.colors.foreground,
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
      healthText: { fontSize: 13 },
      footer: { color: theme.colors.foregroundMuted, fontSize: 11 },
      modalBody: { gap: 16 },
      modalTitle: {
        color: theme.colors.foreground,
        fontSize: 15,
        fontWeight: "600" as const,
      },
      modalText: {
        color: theme.colors.foregroundMuted,
        fontSize: 13,
        lineHeight: 19,
      },
    }),
    [theme, compact, installing, updatingId]
  )

  const command = getInstallCommand(entry)
  const tags = [...entry.categories, ...entry.platforms]
  const limitationsText = entry.limitationsNotesHtml
    ? stripHtml(entry.limitationsNotesHtml)
    : undefined
  const installNotesText = entry.installNotesHtml
    ? stripHtml(entry.installNotesHtml)
    : undefined
  const hasCaveatsSection =
    !!entry.paseoVersionRequirement ||
    entry.platforms.length > 0 ||
    entry.caveats.length > 0 ||
    !!limitationsText
  const health = entry.health
  const securityStatus = entry.security?.status ?? "unknown"
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
  const securityFindingsSummary = entry.security
    ? `${entry.security.blockingFindings} blocking · ${entry.security.advisoryFindings} advisory`
    : "Finding counts unavailable"
  const healthValues = Object.keys(HEALTH_LABELS).map(
    (key) => health?.[key as keyof NonNullable<DirectoryEntry["health"]>]
  )
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
  const securityScannedDate = formatDate(entry.security?.scannedAt)
  const securityReportUrl = entry.security?.reportUrl
  const installable =
    isValidRepo(entry.repo) &&
    (entry.path === undefined || isValidInstallPath(entry.path))
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
          {entry.owner?.avatarUrl ? (
            <Image
              accessible={false}
              source={{ uri: entry.owner.avatarUrl }}
              style={styles.avatar}
            />
          ) : null}
          <Text style={styles.title}>{entry.name}</Text>
          {entry.scanError ? (
            <View style={styles.errorBadge}>
              <Text style={styles.errorBadgeText}>needs attention</Text>
            </View>
          ) : null}
        </View>

        {entry.description ? (
          <Text style={styles.description}>{entry.description}</Text>
        ) : null}

        {tags.length > 0 || entry.paseoVersionRequirement ? (
          <View style={styles.tagsRow}>
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
            onPress={() => openExternal(entry.url)}
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
            This listing is generated automatically from the plugin's own public
            repository. Paseo plugins are trusted, unsandboxed code with
            filesystem, process, and network access — read the source at{" "}
            {entry.repo} before installing.
          </Text>
        </View>

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
            {entry.paseoVersionRequirement ? (
              <Text style={styles.alertBody}>
                Requires Paseo {entry.paseoVersionRequirement} — from this
                plugin's own paseo-plugin.json.
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
              <View style={styles.galleryContent}>
                {entry.images.slice(0, 3).map((image) => (
                  <Image
                    key={image}
                    accessible={false}
                    source={{ uri: image }}
                    style={styles.galleryTile}
                  />
                ))}
              </View>
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
            <Text style={styles.command}>{command}</Text>
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
          </View>
          {installNotesText ? (
            <>
              <Text style={styles.readmeLabel}>From the plugin's README</Text>
              <Text style={styles.readmeText}>{installNotesText}</Text>
            </>
          ) : null}
        </View>

        {manifestText ? (
          <View style={styles.section}>
            <Text style={styles.label}>Manifest</Text>
            <View style={styles.manifestHeaderRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showManifest
                    ? `Hide manifest for ${entry.name}`
                    : `Show manifest for ${entry.name}`
                }
                onPress={() => setShowManifest((current) => !current)}
                style={styles.errorAction}
              >
                <Icon
                  name={showManifest ? "ChevronUp" : "ChevronDown"}
                  size={14}
                  color={theme.colors.accent}
                />
                <Text style={styles.errorActionText}>
                  {showManifest ? "Hide JSON" : "View JSON"}
                </Text>
              </Pressable>
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
            </View>
            {showManifest ? (
              <View style={styles.manifestViewer}>
                <Text selectable style={styles.manifestText}>
                  {manifestText}
                </Text>
              </View>
            ) : null}
          </View>
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
            onPress={() => openExternal(entry.url)}
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
              This listing has an invalid repository or plugin subpath and
              cannot be installed.
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

        <View style={styles.section}>
          <Text style={styles.label}>Security</Text>
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
            {!entry.security ? (
              <Text style={styles.alertBody}>
                No published security scan is available. Finding counts and the
                scan date are unknown.
              </Text>
            ) : (
              <>
                {securityStatus === "unknown" ? (
                  <Text style={styles.alertBody}>
                    The published scan does not report a pass or fail result.
                  </Text>
                ) : null}
                <Text style={styles.alertBody}>
                  Blocking findings: {entry.security.blockingFindings} ·
                  Advisory findings: {entry.security.advisoryFindings}
                </Text>
                <Text selectable style={styles.alertBody}>
                  Scanned {securityScannedDate ?? "Unknown"}
                  {entry.security.commit
                    ? ` at commit ${entry.security.commit}`
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
        </View>

        {health ? (
          <View style={styles.section}>
            <Text style={styles.label}>Health checks</Text>
            <View style={styles.healthGrid}>
              {Object.entries(HEALTH_LABELS).map(([key, label]) => {
                const ok = health[key as keyof typeof health] === true
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
          </View>
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
              {entry.url}
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Install command</Text>
            <View style={styles.commandRow}>
              <Text selectable style={styles.command}>
                {command}
              </Text>
            </View>
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>Freshness and status</Text>
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
            <Text style={styles.modalText}>
              Security: {securityStatusLabel} · {securityFindingsSummary}
            </Text>
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
            {!hasCaveatsSection ? (
              <Text style={styles.modalText}>No catalog caveats reported.</Text>
            ) : null}
          </View>
          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${entry.name} repository`}
              style={styles.secondaryButton}
              onPress={() => openExternal(entry.url)}
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
          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="link"
              style={styles.secondaryButton}
              onPress={() => openExternal(entry.url)}
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
