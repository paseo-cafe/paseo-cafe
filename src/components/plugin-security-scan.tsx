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
import type { PluginSecurity } from "@/lib/plugin-schema"

const STATUS_LABELS: Record<PluginSecurity["status"] | "unset", string> = {
  passed: "Passed",
  failed: "Failed",
  unknown: "Unknown",
  unset: "Unknown",
}

export function PluginSecurityScan({
  security,
}: {
  security?: PluginSecurity
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
      <AlertTitle className="flex flex-wrap items-center gap-2">
        <span>Security scan</span>
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
      <AlertDescription className="space-y-3">
        {attestation ? (
          <>
            <div className="flex flex-wrap gap-2">
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
                {attestation.commit ? ` at commit ${attestation.commit}` : ""}.
              </p>
            ) : null}
            {attestation.reportUrl ? (
              <a
                href={attestation.reportUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-foreground hover:underline"
              >
                Open security report <IconExternalLink className="size-3.5" />
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
}: {
  security?: PluginSecurity
}) {
  return (
    <ExpandableSection
      title="Security scan"
      subtitle={STATUS_LABELS[security?.status ?? "unset"]}
    >
      <PluginSecurityScan security={security} />
    </ExpandableSection>
  )
}
