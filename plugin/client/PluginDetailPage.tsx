import type { PluginTheme } from "@getpaseo/plugin"
import { useRpc } from "@getpaseo/plugin/client"
import {
  copyText,
  Icon,
  Modal,
  ScrollView,
  useToast,
} from "@getpaseo/plugin/client/react-native"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import type {
  LayoutChangeEvent,
  ScrollView as NativeScrollView,
} from "react-native"
import { Platform, Pressable, Text, View } from "react-native"
import { formatCatalogDateForReader } from "../shared/catalog"
import type {
  Artifact,
  DirectoryEntry,
  InstalledPlugin,
  PluginUpdate,
} from "../shared/directory"
import {
  directoryDetailRpc,
  formatArtifactRevision,
  getInstallationStateLabel,
  getInstallCommand,
  getReportPluginIssueUrl,
  getSiteUrl,
  getUpdateCommand,
  SELF_INSTALLATION_ID,
  SUBMIT_URL,
} from "../shared/directory"
import { AspectImage } from "./AspectImage"
import { getDetailPrimaryAction } from "./detail-action"
import { ExpandableSection } from "./ExpandableSection"
import { InlineGallery } from "./InlineGallery"
import { firstImageMedia } from "./media"
import { PluginIcon } from "./PluginIcon"
import {
  getAuthorLabel,
  getCategoryNames,
  getPluginRowInstalls,
} from "./PluginRow"
import { MIN_TOUCH, MONO_FONT, mutedTextColor, radius, space } from "./visual"
import { openExternal } from "./web"

export interface PluginDetailPageProps {
  entry: DirectoryEntry
  theme: PluginTheme
  compact: boolean
  registryUrl: string
  /** False when the daemon's `paseo` CLI is too old to install `owner/slug` ids. */
  installSupported: boolean
  /** Installations of this entry only. */
  installations: readonly InstalledPlugin[]
  inventoryAvailable: boolean
  /** Update check results keyed by installation id. */
  updates: ReadonlyMap<string, PluginUpdate>
  /** Registry category labels keyed by slug. */
  categoryLabels: ReadonlyMap<string, string>
  installing: boolean
  updatingId: string | null
  installError: string | null
  updateError: string | null
  onInstall: () => void
  onUpdate: (installation: InstalledPlugin) => void
  autoUpdateOptOuts: readonly string[]
  autoUpdateSaving: boolean
  onAutoUpdateChange: (installationId: string, enabled: boolean) => void
  onOpenGallery: () => void
  onBack: () => void
}

/** The widest the page body and the action bar grow; the hero is also capped by height below. */
const CONTENT_MAX_WIDTH = 960

function createStyles(theme: PluginTheme, compact: boolean) {
  // Compact layouts and native hosts are touch layouts: every control reaches the minimum target.
  const touchTarget = compact || Platform.OS !== "web"
  const touch = touchTarget ? { minHeight: MIN_TOUCH } : null
  const muted = mutedTextColor(theme)
  const mutedOnCard = mutedTextColor(theme, theme.colors.surface1)
  const mutedOnTag = mutedTextColor(theme, theme.colors.surface2)
  const gutter = compact ? space.lg : space.xl
  return {
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    scroll: { flex: 1 },
    content: {
      width: "100%" as const,
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: "center" as const,
      padding: gutter,
      gap: space.lg,
    },
    backRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      alignSelf: "flex-start" as const,
      gap: space.xs,
      minHeight: MIN_TOUCH,
    },
    backText: {
      color: theme.colors.foreground,
      fontSize: 14,
      textDecorationLine: "underline" as const,
    },
    hero: { borderRadius: radius.lg, overflow: "hidden" as const },
    headerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: space.md,
    },
    headerText: { flex: 1, minWidth: 0, gap: space.xs },
    title: {
      color: theme.colors.foreground,
      fontSize: compact ? 20 : 24,
      fontWeight: "700" as const,
    },
    ownerRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    ownerText: {
      flexShrink: 1,
      color: muted,
      fontSize: 12,
    },
    statRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      columnGap: space.md,
      rowGap: space.xs,
    },
    description: {
      color: theme.colors.foreground,
      fontSize: 14,
      lineHeight: 20,
    },
    descriptionEmpty: {
      color: muted,
      fontSize: 14,
      lineHeight: 20,
      fontStyle: "italic" as const,
    },
    tagsRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: 6,
    },
    tag: {
      borderRadius: radius.sm,
      paddingHorizontal: space.sm,
      paddingVertical: 3,
      backgroundColor: theme.colors.surface2,
    },
    tagText: { color: mutedOnTag, fontSize: 11 },
    metaRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      columnGap: space.md,
      rowGap: space.xs,
      alignItems: "center" as const,
    },
    metaItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: space.xs,
    },
    metaText: { color: muted, fontSize: 12 },
    mono: { fontFamily: MONO_FONT },
    metaTextOnCard: { color: mutedOnCard, fontSize: 12 },
    alert: {
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      padding: space.md,
      backgroundColor: theme.colors.surface1,
    },
    alertTitleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    alertTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      fontWeight: "600" as const,
    },
    alertBody: {
      color: muted,
      fontSize: 14,
      lineHeight: 20,
    },
    alertBodyOnCard: {
      color: mutedOnCard,
      fontSize: 14,
      lineHeight: 20,
    },
    readmeText: {
      color: mutedOnCard,
      fontSize: 13,
      lineHeight: 19,
    },
    readmeViewer: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      padding: space.md,
      backgroundColor: theme.colors.surface1,
    },
    errorBox: {
      borderWidth: 1,
      borderColor: theme.colors.statusDanger,
      borderRadius: radius.md,
      padding: space.md,
      gap: space.sm,
      backgroundColor: theme.colors.surface1,
    },
    errorText: {
      color: theme.colors.statusDanger,
      fontSize: 14,
    },
    errorDetails: {
      color: theme.colors.foreground,
      fontSize: 12,
      lineHeight: 18,
    },
    errorActions: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: space.lg,
    },
    errorAction: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      alignSelf: "flex-start" as const,
      gap: 6,
      minHeight: MIN_TOUCH,
    },
    errorActionText: {
      color: theme.colors.foreground,
      fontSize: 12,
      fontWeight: "600" as const,
      textDecorationLine: "underline" as const,
    },
    section: { gap: 6 },
    label: {
      color: muted,
      fontSize: 12,
      fontWeight: "600" as const,
    },
    linkList: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      columnGap: space.lg,
    },
    textLink: {
      ...touch,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
    },
    textLinkText: {
      color: theme.colors.foreground,
      fontSize: 13,
      textDecorationLine: "underline" as const,
    },
    commandRow: {
      flexDirection: "row" as const,
      alignItems: "stretch" as const,
      gap: space.sm,
    },
    command: {
      flex: 1,
      fontFamily: MONO_FONT,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surface1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      padding: 10,
      fontSize: 12,
    },
    copyButton: {
      minWidth: MIN_TOUCH,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: space.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    reviewCard: {
      gap: space.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      padding: space.md,
      backgroundColor: theme.colors.surface1,
    },
    field: { gap: 2 },
    fieldLabel: {
      color: mutedOnCard,
      fontSize: 11,
      fontWeight: "600" as const,
    },
    fieldValue: {
      color: theme.colors.foreground,
      fontSize: 13,
      lineHeight: 19,
    },
    fieldValueMono: {
      color: theme.colors.foreground,
      fontFamily: MONO_FONT,
      fontSize: 12,
      lineHeight: 18,
    },
    actionsRow: {
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: space.sm,
    },
    button: {
      ...touch,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: space.lg,
      paddingVertical: 10,
      borderRadius: radius.md,
      backgroundColor: theme.colors.accent,
    },
    buttonText: {
      color: theme.colors.accentForeground,
      fontSize: 14,
      fontWeight: "600" as const,
    },
    buttonFill: { flex: 1 },
    buttonDisabled: { opacity: 0.5 },
    secondaryButton: {
      ...touch,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: space.lg,
      paddingVertical: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryButtonText: {
      color: theme.colors.foreground,
      fontSize: 14,
    },
    installedButton: {
      flexDirection: "row" as const,
      gap: space.sm,
    },
    installationList: { gap: space.sm },
    installationCard: {
      gap: space.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: radius.md,
      padding: space.md,
      backgroundColor: theme.colors.surface1,
    },
    installationTitle: {
      color: theme.colors.foreground,
      fontSize: 14,
      fontWeight: "600" as const,
    },
    installationId: {
      fontFamily: MONO_FONT,
      fontWeight: "400" as const,
      fontSize: 12,
    },
    switchRow: {
      ...touch,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: space.md,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    switchLabel: {
      flexShrink: 1,
      color: theme.colors.foreground,
      fontSize: 14,
    },
    switchControl: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: space.sm,
    },
    switchState: { color: mutedOnCard, fontSize: 12, minWidth: 20 },
    switchTrack: {
      width: 36,
      height: 20,
      borderRadius: 10,
      padding: 2,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface2,
    },
    switchTrackOn: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
    },
    switchThumb: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: mutedOnTag,
    },
    switchThumbOn: {
      alignSelf: "flex-end" as const,
      backgroundColor: theme.colors.accentForeground,
    },
    footerBar: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface0,
    },
    footerInner: {
      width: "100%" as const,
      maxWidth: CONTENT_MAX_WIDTH,
      alignSelf: "center" as const,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "flex-end" as const,
      gap: space.sm,
      paddingHorizontal: gutter,
      paddingVertical: space.md,
    },
    footerLinks: {
      flex: 1,
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: space.sm,
    },
    modalBody: { gap: space.lg },
    modalTitle: {
      color: theme.colors.foreground,
      fontFamily: MONO_FONT,
      fontSize: 14,
      fontWeight: "600" as const,
    },
    modalText: {
      color: muted,
      fontSize: 14,
      lineHeight: 20,
    },
  }
}

/** A 40 to 64 character commit shown in full would dominate a button, so cut it to the usual 12. */
function shortenRevision(revision: string): string {
  return /^[0-9a-f]{40,64}$/i.test(revision) ? revision.slice(0, 12) : revision
}

interface ButtonSpec {
  label: string
  accessibilityLabel: string
  onPress: () => void
  role?: "button" | "link"
  primary?: boolean
  disabled?: boolean
  /** Stretches across the row it sits in. */
  fill?: boolean
}

interface TextLinkSpec {
  label: string
  accessibilityLabel: string
  url: string
}

/** The labelled fields of the artifact the registry pins, which is what an install is reviewed against. */
function getArtifactRows(artifact: Artifact): Array<readonly [string, string]> {
  if (artifact.kind === "npm") {
    return [
      ["npm package", `${artifact.package}@${artifact.version}`],
      ["Integrity", artifact.integrity],
    ]
  }
  const rows: Array<readonly [string, string]> = [
    ["Git remote", artifact.remote],
    ["Commit", artifact.commit],
  ]
  if (artifact.pluginPath) rows.push(["Plugin path", artifact.pluginPath])
  return rows
}

export function PluginDetailPage({
  entry,
  theme,
  compact,
  registryUrl,
  installSupported,
  installations,
  inventoryAvailable,
  updates,
  categoryLabels,
  installing,
  updatingId,
  installError,
  updateError,
  onInstall,
  onUpdate,
  autoUpdateOptOuts,
  autoUpdateSaving,
  onAutoUpdateChange,
  onOpenGallery,
  onBack,
}: PluginDetailPageProps) {
  const toast = useToast()
  const [confirmingInstall, setConfirmingInstall] = useState(false)
  const [confirmingUpdate, setConfirmingUpdate] =
    useState<InstalledPlugin | null>(null)
  const [showFullActionError, setShowFullActionError] = useState(false)
  const scrollRef = useRef<NativeScrollView>(null)
  // The action error the page has already scrolled to, so toggling "View more" does not scroll again.
  const revealedActionError = useRef<string | null>(null)
  const styles = useMemo(() => createStyles(theme, compact), [theme, compact])
  const readDetail = useRpc(directoryDetailRpc)
  const readme = useQuery({
    queryKey: ["paseo-cafe-readme", registryUrl, entry.id],
    queryFn: () => readDetail({ registryUrl, id: entry.id }),
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const copy = async (text: string, message: string) => {
    try {
      await copyText(text)
      toast.show(message)
    } catch {
      toast.error("Could not copy to the clipboard")
    }
  }

  const renderButton = ({
    label,
    accessibilityLabel,
    onPress,
    role = "button",
    primary = false,
    disabled = false,
    fill = false,
  }: ButtonSpec) => (
    <Pressable
      key={label}
      accessibilityRole={role}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      style={[
        primary ? styles.button : styles.secondaryButton,
        fill ? styles.buttonFill : null,
        disabled ? styles.buttonDisabled : null,
      ]}
      onPress={onPress}
    >
      <Text style={primary ? styles.buttonText : styles.secondaryButtonText}>
        {label}
      </Text>
    </Pressable>
  )

  const renderTextLink = ({ label, accessibilityLabel, url }: TextLinkSpec) => (
    <Pressable
      key={label}
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      style={styles.textLink}
      onPress={() => openExternal(url)}
    >
      <Icon name="ExternalLink" size={14} color={theme.colors.foreground} />
      <Text style={styles.textLinkText}>{label}</Text>
    </Pressable>
  )

  const renderField = (label: string, value: string, mono = true) => (
    <View key={label} style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text selectable style={mono ? styles.fieldValueMono : styles.fieldValue}>
        {value}
      </Text>
    </View>
  )

  const installCommand = getInstallCommand(registryUrl, entry.id)
  const actionPending = installing || updatingId !== null
  const author = getAuthorLabel(entry.author)
  const description = entry.description.trim()
  const categories = getCategoryNames(entry, categoryLabels)
  const installs = getPluginRowInstalls(entry)
  const revision = formatArtifactRevision(entry.artifact)
  const revisionLabel =
    entry.artifact.kind === "npm" ? `v${revision}` : revision
  const addedDate = formatCatalogDateForReader(entry.publishedAt)
  const updatedDate = formatCatalogDateForReader(entry.updatedAt)
  // The hero is the first image; the inline gallery pages through the rest so no image shows twice.
  const heroUrl = firstImageMedia(entry.media)
  const galleryUrls = entry.media.filter((url) => url !== heroUrl)
  const confirmingUpdateTarget = confirmingUpdate
    ? updates.get(confirmingUpdate.id)?.target
    : undefined
  const actionError = installations.length > 0 ? updateError : installError
  // The toggle and the clamp share one condition: a short error is never
  // clamped, so wrapping on a narrow screen cannot hide text with no way back.
  const actionErrorIsLong =
    actionError !== null &&
    (actionError.length > 240 || actionError.split("\n").length > 6)
  const readmeText = readme.data?.readme.trim() ?? ""
  const readmeSubtitle = readme.isPending
    ? "Loading…"
    : readme.isError
      ? "Unavailable"
      : readmeText === ""
        ? "None"
        : "Plain text"

  const repositoryLink: TextLinkSpec = {
    label: "View repository",
    accessibilityLabel: `Open ${entry.name} repository`,
    url: entry.repository.url,
  }
  const reportLink: TextLinkSpec = {
    label: "Report plugin",
    accessibilityLabel: `Report ${entry.name} on GitHub`,
    url: getReportPluginIssueUrl(entry.id),
  }
  const siteLink: TextLinkSpec = {
    label: "View on paseo.sh",
    accessibilityLabel: `Open ${entry.name} on paseo.sh`,
    url: getSiteUrl(entry.id),
  }
  const submitLink: TextLinkSpec = {
    label: "Submit a plugin",
    accessibilityLabel: "Submit a plugin to the directory",
    url: SUBMIT_URL,
  }
  // The action bar has room for the secondary links beside its button on a wide layout only.
  const footerLinks = compact ? [] : [repositoryLink, reportLink]
  const bodyLinks = compact
    ? [repositoryLink, reportLink, siteLink, submitLink]
    : [siteLink, submitLink]

  const primaryAction = getDetailPrimaryAction({
    installations,
    updates,
    inventoryAvailable,
    installable: installCommand !== undefined,
  })
  const showFooter = primaryAction !== undefined || footerLinks.length > 0

  const reviewFields: Array<readonly [string, string]> = [
    [
      "Source repository",
      `${entry.repository.url}${entry.repository.commit ? ` @ ${entry.repository.commit}` : ""}`,
    ],
    ...getArtifactRows(entry.artifact),
  ]

  useEffect(() => {
    if (actionError === null) revealedActionError.current = null
  }, [actionError])

  // The primary action sits in the sticky bar, so an error it raises can be well out of view in the body.
  const revealActionError = (event: LayoutChangeEvent) => {
    if (actionError === null || revealedActionError.current === actionError) {
      return
    }
    revealedActionError.current = actionError
    scrollRef.current?.scrollTo({
      y: event.nativeEvent.layout.y,
      animated: true,
    })
  }

  const renderPrimaryAction = () => {
    if (primaryAction?.kind === "update") {
      return renderButton({
        primary: true,
        fill: compact,
        label:
          updatingId !== null
            ? "Updating…"
            : primaryAction.count > 1
              ? `Update (${primaryAction.count})`
              : "Update",
        accessibilityLabel:
          primaryAction.count > 1
            ? `Review the update of ${entry.name} installation ${primaryAction.target.id}, ${primaryAction.count} installations have updates`
            : `Review the update of ${entry.name}`,
        disabled: actionPending,
        onPress: () => setConfirmingUpdate(primaryAction.target),
      })
    }
    if (primaryAction?.kind === "installed") {
      return (
        <Pressable
          disabled
          accessibilityRole="button"
          accessibilityLabel={`${entry.name} is installed`}
          accessibilityState={{ disabled: true }}
          style={[
            styles.secondaryButton,
            styles.installedButton,
            compact ? styles.buttonFill : null,
          ]}
        >
          <Icon name="Check" size={16} color={theme.colors.statusSuccess} />
          <Text style={styles.secondaryButtonText}>Installed</Text>
        </Pressable>
      )
    }
    if (primaryAction?.kind === "install") {
      return renderButton({
        primary: true,
        fill: compact,
        label: installing ? "Installing…" : "Review & install",
        accessibilityLabel: `Review ${entry.name} before installing`,
        disabled: actionPending || !installSupported,
        onPress: () => setConfirmingInstall(true),
      })
    }
    return null
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Paseo Cafe"
          style={styles.backRow}
          onPress={onBack}
        >
          <Icon name="ArrowLeft" size={16} color={theme.colors.foreground} />
          <Text style={styles.backText}>Paseo Cafe</Text>
        </Pressable>

        {heroUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open gallery for ${entry.name}`}
            style={styles.hero}
            onPress={onOpenGallery}
          >
            <AspectImage
              uri={heroUrl}
              maxHeight={compact ? 240 : 360}
              label={`${entry.name} screenshot ${entry.media.indexOf(heroUrl) + 1} of ${entry.media.length}`}
              backgroundColor={theme.colors.surface2}
              borderRadius={radius.lg}
              fallbackTextColor={mutedTextColor(theme, theme.colors.surface2)}
            />
          </Pressable>
        ) : null}

        <View style={styles.headerRow}>
          {/* Without a hero image the icon is the page's only visual, so it grows. */}
          <PluginIcon
            entry={entry}
            theme={theme}
            size={heroUrl ? (compact ? 48 : 56) : compact ? 72 : 96}
          />
          <View style={styles.headerText}>
            <Text role="heading" aria-level={1} style={styles.title}>
              {entry.name}
            </Text>
            {author ? (
              <View style={styles.ownerRow}>
                <Icon
                  name="Github"
                  size={14}
                  color={theme.colors.foregroundMuted}
                />
                <Text style={styles.ownerText}>
                  by {author}
                  {entry.author.name && entry.author.name !== author
                    ? ` (${entry.author.name})`
                    : ""}
                </Text>
              </View>
            ) : null}
            <View style={styles.statRow}>
              {installs ? (
                <View style={styles.metaItem}>
                  <Icon
                    name="Download"
                    size={13}
                    color={theme.colors.foregroundMuted}
                  />
                  <Text
                    accessibilityLabel={installs.accessibilityLabel}
                    style={styles.metaText}
                  >
                    {installs.text}
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.metaText, styles.mono]}>
                {revisionLabel}
              </Text>
            </View>
          </View>
        </View>

        {categories.length > 0 ? (
          <View style={styles.tagsRow}>
            {categories.map((category) => (
              <View key={category} style={styles.tag}>
                <Text style={styles.tagText}>{category}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text
          style={description ? styles.description : styles.descriptionEmpty}
        >
          {description || "No description provided."}
        </Text>

        {updatedDate || addedDate || entry.license ? (
          <View style={styles.metaRow}>
            {updatedDate ? (
              <Text style={styles.metaText}>Updated {updatedDate}</Text>
            ) : null}
            {addedDate ? (
              <Text style={styles.metaText}>Added {addedDate}</Text>
            ) : null}
            {entry.license ? (
              <Text style={styles.metaText}>License: {entry.license}</Text>
            ) : null}
          </View>
        ) : null}

        {galleryUrls.length > 0 ? (
          <InlineGallery
            entryName={entry.name}
            media={entry.media}
            urls={galleryUrls}
            theme={theme}
            compact={compact}
            onOpenGallery={onOpenGallery}
          />
        ) : null}

        <ExpandableSection
          title="README"
          subtitle={readmeSubtitle}
          theme={theme}
        >
          {readme.isPending ? (
            <Text style={styles.alertBodyOnCard}>Loading README…</Text>
          ) : readme.isError ? (
            <View style={styles.section}>
              <Text style={styles.errorText}>Could not load the README.</Text>
              <Text selectable style={styles.errorDetails}>
                {readme.error instanceof Error
                  ? readme.error.message
                  : String(readme.error)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Retry loading the README for ${entry.name}`}
                onPress={() => void readme.refetch()}
                style={styles.errorAction}
              >
                <Icon
                  name="RefreshCw"
                  size={14}
                  color={theme.colors.foreground}
                />
                <Text style={styles.errorActionText}>Retry</Text>
              </Pressable>
            </View>
          ) : readmeText === "" ? (
            <Text style={styles.alertBodyOnCard}>
              This plugin has no README.
            </Text>
          ) : (
            <View style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Copy README text for ${entry.name}`}
                onPress={() => copy(readmeText, "Copied README text")}
                style={styles.errorAction}
              >
                <Icon name="Copy" size={14} color={theme.colors.foreground} />
                <Text style={styles.errorActionText}>Copy text</Text>
              </Pressable>
              <View style={styles.readmeViewer}>
                <Text selectable style={styles.readmeText}>
                  {readmeText}
                </Text>
              </View>
            </View>
          )}
        </ExpandableSection>

        {!inventoryAvailable ? (
          <View accessibilityRole="alert" style={styles.errorBox}>
            <Text style={styles.errorText}>
              Installed plugin status unavailable
            </Text>
            <Text style={styles.alertBodyOnCard}>
              Install and update actions are disabled until Paseo can read this
              host's plugin inventory.
            </Text>
          </View>
        ) : null}

        {installations.length > 0 ? (
          <View style={styles.installationList}>
            <Text role="heading" aria-level={2} style={styles.label}>
              Installations
            </Text>
            {installations.map((installation) => {
              const update = updates.get(installation.id)
              const optedOut = autoUpdateOptOuts.includes(installation.id)
              const source =
                installation.kind === "npm"
                  ? installation.packageName
                  : installation.kind === "git"
                    ? installation.remote
                    : "Local directory"
              const details = [
                source && installation.pluginPath
                  ? `${source} / ${installation.pluginPath}`
                  : source,
                installation.revision,
              ].filter(Boolean)
              const switchDisabled = actionPending || autoUpdateSaving
              return (
                <View key={installation.id} style={styles.installationCard}>
                  <Text style={styles.installationTitle}>
                    {getInstallationStateLabel(installation, update)} ·{" "}
                    <Text style={styles.installationId}>{installation.id}</Text>
                  </Text>
                  {details.length > 0 ? (
                    <Text
                      selectable
                      style={[styles.metaTextOnCard, styles.mono]}
                    >
                      {details.join(" · ")}
                    </Text>
                  ) : null}
                  <Text
                    style={
                      installation.status === "failed"
                        ? styles.errorText
                        : styles.metaTextOnCard
                    }
                  >
                    Status: {installation.status}
                  </Text>
                  {update?.outcome === "error" && update.error ? (
                    <Text selectable style={styles.errorText}>
                      {update.error}
                    </Text>
                  ) : null}
                  {installation.kind !== "directory" ? (
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityLabel={`Automatic updates for ${installation.id}`}
                      accessibilityState={{
                        checked: !optedOut,
                        disabled: switchDisabled,
                      }}
                      aria-checked={!optedOut}
                      disabled={switchDisabled}
                      style={[
                        styles.switchRow,
                        switchDisabled ? styles.buttonDisabled : null,
                      ]}
                      onPress={() =>
                        onAutoUpdateChange(installation.id, optedOut)
                      }
                    >
                      <Text style={styles.switchLabel}>Automatic updates</Text>
                      <View style={styles.switchControl}>
                        <Text style={styles.switchState}>
                          {optedOut ? "Off" : "On"}
                        </Text>
                        <View
                          style={[
                            styles.switchTrack,
                            optedOut ? null : styles.switchTrackOn,
                          ]}
                        >
                          <View
                            style={[
                              styles.switchThumb,
                              optedOut ? null : styles.switchThumbOn,
                            ]}
                          />
                        </View>
                      </View>
                    </Pressable>
                  ) : null}
                  {update?.outcome === "update" ? (
                    <View style={styles.actionsRow}>
                      {renderButton({
                        primary: true,
                        label:
                          updatingId === installation.id
                            ? "Updating…"
                            : update.target
                              ? `Update to ${shortenRevision(update.target)}`
                              : "Update",
                        accessibilityLabel: `Review the update of ${entry.name} installation ${installation.id}`,
                        disabled: actionPending,
                        onPress: () => setConfirmingUpdate(installation),
                      })}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        ) : null}

        {actionError ? (
          <View
            accessibilityRole="alert"
            style={styles.errorBox}
            onLayout={revealActionError}
          >
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
                    color={theme.colors.foreground}
                  />
                  <Text style={styles.errorActionText}>
                    {showFullActionError ? "Show less" : "View more…"}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy action error output"
                onPress={() => copy(actionError, "Copied action error output")}
                style={styles.errorAction}
              >
                <Icon name="Copy" size={14} color={theme.colors.foreground} />
                <Text style={styles.errorActionText}>Copy error</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text role="heading" aria-level={2} style={styles.label}>
            Install
          </Text>
          {installCommand ? (
            <View style={styles.commandRow}>
              <Text selectable style={styles.command}>
                {installCommand}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy install command"
                style={styles.copyButton}
                onPress={() => copy(installCommand, "Copied install command")}
              >
                <Icon name="Copy" size={16} color={theme.colors.foreground} />
              </Pressable>
            </View>
          ) : (
            <Text style={styles.alertBody}>
              Plugins cannot be installed from this registry URL. Installing
              works with the default registry or an HTTPS registry served from
              the root of its host.
            </Text>
          )}
          {installCommand && !installSupported ? (
            <Text style={styles.alertBody}>
              Installing needs Paseo 0.11.0-beta.4 or later on this host.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text role="heading" aria-level={2} style={styles.label}>
            Pinned artifact
          </Text>
          <View style={styles.reviewCard}>
            {reviewFields.map(([label, value]) => renderField(label, value))}
          </View>
        </View>

        <View style={styles.section}>
          <Text role="heading" aria-level={2} style={styles.label}>
            Links
          </Text>
          <View style={styles.linkList}>{bodyLinks.map(renderTextLink)}</View>
        </View>
      </ScrollView>

      {showFooter ? (
        <View style={styles.footerBar}>
          <View style={styles.footerInner}>
            {footerLinks.length > 0 ? (
              <View style={styles.footerLinks}>
                {footerLinks.map((link) =>
                  renderButton({
                    role: "link",
                    label: link.label,
                    accessibilityLabel: link.accessibilityLabel,
                    onPress: () => openExternal(link.url),
                  })
                )}
              </View>
            ) : null}
            {renderPrimaryAction()}
          </View>
        </View>
      ) : null}

      <Modal
        title={`Review ${entry.name} installation`}
        icon={
          <Icon name="Download" size={18} color={theme.colors.foreground} />
        }
        open={confirmingInstall}
        onOpenChange={setConfirmingInstall}
      >
        <Modal.Content contentContainerStyle={styles.modalBody}>
          {reviewFields.map(([label, value]) => renderField(label, value))}
          {installCommand ? (
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Install command</Text>
              <View style={styles.commandRow}>
                <Text selectable style={styles.command}>
                  {installCommand}
                </Text>
              </View>
            </View>
          ) : null}
          <Text style={styles.modalText}>
            Paseo installs exactly this artifact. If the registry pin changes
            before you confirm, the install is refused.
          </Text>
          <View style={styles.alert}>
            <View style={styles.alertTitleRow}>
              <Icon
                name="AlertTriangle"
                size={14}
                color={theme.colors.statusWarning}
              />
              <Text style={styles.alertTitle}>Trusted, unsandboxed code</Text>
            </View>
            <Text style={styles.alertBodyOnCard}>
              Plugin server code, build commands, dependencies, and future
              updates run as trusted code on the Paseo host. Review the source
              before installing.
            </Text>
          </View>
          <View style={styles.actionsRow}>
            {renderButton({
              role: "link",
              label: repositoryLink.label,
              accessibilityLabel: repositoryLink.accessibilityLabel,
              onPress: () => openExternal(repositoryLink.url),
            })}
            {renderButton({
              label: "Cancel",
              accessibilityLabel: "Cancel installation",
              onPress: () => setConfirmingInstall(false),
            })}
            {renderButton({
              primary: true,
              label: installing ? "Installing…" : "Install",
              accessibilityLabel: `Confirm installation of ${entry.name}`,
              disabled: actionPending || !installSupported,
              onPress: () => {
                setConfirmingInstall(false)
                onInstall()
              },
            })}
          </View>
        </Modal.Content>
      </Modal>

      <Modal
        title={`Update ${entry.name}?`}
        icon={
          <Icon name="RefreshCw" size={18} color={theme.colors.foreground} />
        }
        open={confirmingUpdate !== null}
        onOpenChange={(open: boolean) => {
          if (!open) setConfirmingUpdate(null)
        }}
      >
        <Modal.Content contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalTitle}>{confirmingUpdate?.id}</Text>
          {renderField(
            "Installed",
            confirmingUpdate?.revision ?? "unknown revision",
            Boolean(confirmingUpdate?.revision)
          )}
          {renderField(
            "Update to",
            confirmingUpdateTarget ?? "the latest pinned release",
            Boolean(confirmingUpdateTarget)
          )}
          {confirmingUpdate ? (
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>Update command</Text>
              <View style={styles.commandRow}>
                <Text selectable style={styles.command}>
                  {getUpdateCommand(confirmingUpdate.id)}
                </Text>
              </View>
            </View>
          ) : null}
          {confirmingUpdate?.id === SELF_INSTALLATION_ID ? (
            <Text style={styles.modalText}>
              Paseo Cafe restarts when this update finishes, so the result
              appears once it reloads.
            </Text>
          ) : null}
          <Text style={styles.modalText}>
            Updating replaces trusted, unsandboxed plugin code on this Paseo
            host. Review the source before continuing.
          </Text>
          <View style={styles.actionsRow}>
            {renderButton({
              role: "link",
              label: repositoryLink.label,
              accessibilityLabel: repositoryLink.accessibilityLabel,
              onPress: () => openExternal(repositoryLink.url),
            })}
            {renderButton({
              label: "Cancel",
              accessibilityLabel: "Cancel update",
              onPress: () => setConfirmingUpdate(null),
            })}
            {renderButton({
              primary: true,
              label: updatingId ? "Updating…" : "Update",
              accessibilityLabel: `Confirm update of ${entry.name}`,
              disabled: actionPending,
              onPress: () => {
                if (confirmingUpdate) onUpdate(confirmingUpdate)
                setConfirmingUpdate(null)
              },
            })}
          </View>
        </Modal.Content>
      </Modal>
    </View>
  )
}
