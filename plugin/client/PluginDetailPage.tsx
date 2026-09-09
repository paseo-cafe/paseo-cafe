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
  installation?: InstalledPlugin
  installing: boolean
  updating: boolean
  installError: string | null
  updateError: string | null
  onInstall: () => void
  onUpdate: () => void
  onOpenGallery: () => void
  onBack: () => void
}

/** "2026-09-08T01:09:51Z" -> "2026-09-08". No Intl formatting — good enough for a byline. */
function formatDate(iso: string | undefined): string | undefined {
  return iso ? iso.slice(0, 10) : undefined
}

export function PluginDetailPage({
  entry,
  theme,
  compact,
  installation,
  installing,
  updating,
  installError,
  updateError,
  onInstall,
  onUpdate,
  onOpenGallery,
  onBack,
}: PluginDetailPageProps) {
  const toast = useToast()
  const [confirmingInstall, setConfirmingInstall] = useState(false)
  const [showFullActionError, setShowFullActionError] = useState(false)

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
        opacity: installing || updating ? 0.6 : 1,
      },
      buttonText: {
        color: theme.colors.accentForeground,
        fontSize: 14,
        fontWeight: "600" as const,
      },
      secondaryButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
      },
      secondaryButtonText: { color: theme.colors.foreground, fontSize: 14 },
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
    [theme, compact, installing, updating]
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
  const installable =
    isValidRepo(entry.repo) &&
    (entry.path === undefined || isValidInstallPath(entry.path))
  const actionPending = installing || updating
  const canUpdate =
    installation?.source === "git" && installation.updateAvailable
  const actionEnabled = installation ? canUpdate : installable
  const primaryActionLabel = updating
    ? "Updating…"
    : installing
      ? "Installing…"
      : installation
        ? "Update"
        : "Install"
  const actionError = installation ? updateError : installError
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

        {entry.scanError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{entry.scanError}</Text>
          </View>
        ) : null}

        {entry.images.length > 0 ? (
          <View style={styles.section}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.gallery}
              contentContainerStyle={styles.galleryContent}
            >
              {entry.images.map((image, index) => (
                <Pressable
                  key={image}
                  accessibilityRole="button"
                  accessibilityLabel={`View all screenshots of ${entry.name}, starting at image ${index + 1}`}
                  onPress={onOpenGallery}
                >
                  <Image
                    source={{ uri: image }}
                    style={styles.galleryTile}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
            {entry.images.length > 1 ? (
              <Pressable accessibilityRole="link" onPress={onOpenGallery}>
                <Text style={styles.linkText}>
                  View all {entry.images.length} screenshots →
                </Text>
              </Pressable>
            ) : null}
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

        {installation ? (
          <Text style={styles.metaText}>
            {installation.source === "directory"
              ? "Installed locally"
              : installation.updateAvailable
                ? "Update available"
                : "Up to date"}
            {` · ${installation.id}`}
            {installation.commit
              ? ` at ${installation.commit.slice(0, 12)}`
              : ""}
            .
          </Text>
        ) : null}

        <View style={styles.actionsRow}>
          {!installation || canUpdate ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${installation ? "Update" : "Install"} ${entry.name}`}
              accessibilityState={{ disabled: actionPending || !actionEnabled }}
              style={[styles.button, !actionEnabled ? { opacity: 0.5 } : null]}
              disabled={actionPending || !actionEnabled}
              onPress={
                installation ? onUpdate : () => setConfirmingInstall(true)
              }
            >
              <Text style={styles.buttonText}>{primaryActionLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Open ${entry.name} on GitHub`}
            style={styles.secondaryButton}
            onPress={() => openExternal(entry.url)}
          >
            <Text style={styles.secondaryButtonText}>View repo</Text>
          </Pressable>
        </View>

        {!installation && !installable ? (
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
              {installation ? "Update failed" : "Installation failed"}
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
        title={`Install ${entry.name}?`}
        icon={<Icon name="Download" size={18} color={theme.colors.accent} />}
        open={confirmingInstall}
        onOpenChange={setConfirmingInstall}
      >
        <Modal.Content contentContainerStyle={styles.modalBody}>
          <Text style={styles.modalTitle}>
            {entry.repo}
            {entry.path ? `/${entry.path}` : ""}
          </Text>
          <Text style={styles.modalText}>
            Plugin server code, build commands, dependencies, and future updates
            run as trusted code on the Paseo host. Review the repository before
            installing.
          </Text>
          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="link"
              style={styles.secondaryButton}
              onPress={() => openExternal(entry.url)}
            >
              <Text style={styles.secondaryButtonText}>View repo</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={() => setConfirmingInstall(false)}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => {
                setConfirmingInstall(false)
                onInstall()
              }}
            >
              <Text style={styles.buttonText}>Install</Text>
            </Pressable>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  )
}
