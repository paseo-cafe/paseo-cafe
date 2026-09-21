import {
  IconAlertTriangle,
  IconCheck,
  IconExternalLink,
  IconX,
} from "@tabler/icons-react"
import { ExpandableSection } from "@/components/expandable-section"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { formatDateTime } from "@/lib/format-date"
import type { PluginNpmSecurity, PluginSecurity } from "@/lib/plugin-schema"

const STATUS_LABELS: Record<PluginSecurity["status"] | "unset", string> = {
  passed: "Passed",
  failed: "Failed",
  unknown: "Unknown",
  unset: "Unknown",
}

export function PluginSecurityScan({
  security,
  source = "Git",
}: {
  security?: PluginSecurity | PluginNpmSecurity
  source?: "Git" | "npm"
}) {
  const attestation =
    security?.status === "passed" || security?.status === "failed"
      ? security
      : undefined

  return (
    <Alert>
      {security?.status === "passed" ? (
        <IconCheck />
      ) : security?.status === "failed" ? (
        <IconX />
      ) : (
        <IconAlertTriangle />
      )}
      <AlertTitle className="flex flex-wrap items-center gap-group">
        <span>{source} security scan</span>
        <Badge
          variant={
            security?.status === "passed"
              ? "default"
              : security?.status === "failed"
                ? "destructive"
                : "outline"
          }
        >
          {STATUS_LABELS[security?.status ?? "unset"]}
        </Badge>
      </AlertTitle>
      <AlertDescription className="space-y-stack">
        {attestation ? (
          <>
            <div className="flex flex-wrap gap-group">
              <Badge variant="outline">
                Blocking findings: {attestation.blockingFindings}
              </Badge>
              <Badge variant="secondary">
                Advisory findings: {attestation.advisoryFindings}
              </Badge>
            </div>
            {attestation.scannedAt ? (
              <p>
                Scanned {formatDateTime(attestation.scannedAt)}
                {"commit" in attestation && attestation.commit
                  ? ` at commit ${attestation.commit}`
                  : ""}
                .
              </p>
            ) : null}
            {"reportUrl" in attestation && attestation.reportUrl ? (
              <a
                href={attestation.reportUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-inline text-foreground hover:underline"
              >
                Open security report{" "}
                <IconExternalLink className="size-icon-sm" />
              </a>
            ) : null}
          </>
        ) : (
          <p>No published security scan is available for this plugin yet.</p>
        )}
      </AlertDescription>
    </Alert>
  )
}

export function PluginSecurityScanSection({
  security,
  source,
}: {
  security?: PluginSecurity | PluginNpmSecurity
  source?: "Git" | "npm"
}) {
  return (
    <ExpandableSection
      title={`${source ?? "Git"} security scan`}
      subtitle={STATUS_LABELS[security?.status ?? "unset"]}
    >
      <PluginSecurityScan security={security} source={source} />
    </ExpandableSection>
  )
}
