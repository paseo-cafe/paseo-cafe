import { z } from "zod"
import { registryIdSchema } from "./registry-schema"

export const INSTALL_COUNTS_SCHEMA_VERSION = 1 as const

const utcTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(
    (value) => {
      const milliseconds = Date.parse(value)
      return (
        Number.isFinite(milliseconds) &&
        new Date(milliseconds).toISOString() === value
      )
    },
    { message: "must be a canonical UTC ISO timestamp" }
  )

const safeCountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

export const cafeCountsSchema = z
  .object({
    schemaVersion: z.literal(INSTALL_COUNTS_SCHEMA_VERSION),
    asOf: utcTimestampSchema.nullable(),
    trackingSince: utcTimestampSchema.nullable(),
    counts: z.record(registryIdSchema, safeCountSchema),
  })
  .strict()
  .superRefine((value, context) => {
    const countIds = Object.keys(value.counts)

    if (value.trackingSince === null && value.asOf !== null) {
      context.addIssue({
        code: "custom",
        path: ["asOf"],
        message: "cannot publish counts before tracking starts",
      })
    }

    if (value.asOf === null) {
      if (countIds.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["counts"],
          message: "must be empty without a publishable observation period",
        })
      }
      return
    }

    if (!value.asOf.endsWith("T00:00:00.000Z")) {
      context.addIssue({
        code: "custom",
        path: ["asOf"],
        message: "must be the start of a UTC day",
      })
    }

    if (value.trackingSince !== null && value.trackingSince >= value.asOf) {
      context.addIssue({
        code: "custom",
        path: ["trackingSince"],
        message: "must precede the publication cutoff",
      })
    }
  })

export type CafeCounts = z.infer<typeof cafeCountsSchema>

const unavailableSnapshotSchema = z
  .object({
    schemaVersion: z.literal(INSTALL_COUNTS_SCHEMA_VERSION),
    status: z.literal("unavailable"),
    attemptedAt: utcTimestampSchema,
    fetchedAt: z.null(),
    data: z.null(),
  })
  .strict()

export function isCurrentInstallCounts(
  data: CafeCounts,
  observedAt: string
): boolean {
  const currentCutoff = `${observedAt.slice(0, 10)}T00:00:00.000Z`
  if (data.asOf !== null) return data.asOf === currentCutoff
  return data.trackingSince === null || data.trackingSince >= currentCutoff
}

const retainedSnapshotSchema = z
  .object({
    schemaVersion: z.literal(INSTALL_COUNTS_SCHEMA_VERSION),
    status: z.enum(["available", "stale"]),
    attemptedAt: utcTimestampSchema,
    fetchedAt: utcTimestampSchema,
    data: cafeCountsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fetchedAt > value.attemptedAt) {
      context.addIssue({
        code: "custom",
        path: ["fetchedAt"],
        message: "cannot be later than the most recent fetch attempt",
      })
    }

    if (value.status === "available" && value.fetchedAt !== value.attemptedAt) {
      context.addIssue({
        code: "custom",
        path: ["fetchedAt"],
        message: "must match attemptedAt for an available snapshot",
      })
    }

    if (
      value.status === "available" &&
      !isCurrentInstallCounts(value.data, value.fetchedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "must be stale when the publication cutoff is out of date",
      })
    }

    if (value.data.asOf !== null && value.data.asOf > value.fetchedAt) {
      context.addIssue({
        code: "custom",
        path: ["data", "asOf"],
        message: "cannot be later than the successful fetch",
      })
    }

    if (
      value.data.trackingSince !== null &&
      value.data.trackingSince > value.fetchedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["data", "trackingSince"],
        message: "cannot be later than the successful fetch",
      })
    }
  })

export const installCountsSnapshotSchema = z.union([
  unavailableSnapshotSchema,
  retainedSnapshotSchema,
])

export type InstallCountsSnapshot = z.infer<typeof installCountsSnapshotSchema>

function retainCatalogCounts(
  counts: CafeCounts,
  catalogIds: readonly string[]
): void {
  const knownIds = new Set(catalogIds)
  // The website and service deploy independently. New entries have no count
  // until the service knows them; removed entries must not hide other totals.
  for (const id of Object.keys(counts.counts)) {
    if (!knownIds.has(id)) delete counts.counts[id]
  }
}

export function parseCafeCounts(
  input: unknown,
  catalogIds: readonly string[]
): CafeCounts {
  const counts = cafeCountsSchema.parse(input)
  retainCatalogCounts(counts, catalogIds)
  return counts
}

export function parseInstallCountsSnapshot(
  input: unknown,
  catalogIds: readonly string[]
): InstallCountsSnapshot {
  const snapshot = installCountsSnapshotSchema.parse(input)
  if (snapshot.data !== null) retainCatalogCounts(snapshot.data, catalogIds)
  return snapshot
}

export function reclassifyInstallCountsSnapshot(
  input: unknown,
  catalogIds: readonly string[],
  observedAt: string
): InstallCountsSnapshot {
  const snapshot = parseInstallCountsSnapshot(input, catalogIds)
  if (
    snapshot.status !== "available" ||
    snapshot.data === null ||
    isCurrentInstallCounts(snapshot.data, observedAt)
  ) {
    return snapshot
  }
  return parseInstallCountsSnapshot(
    { ...snapshot, status: "stale" },
    catalogIds
  )
}

export function receivedInstallCountsSnapshot(
  data: CafeCounts,
  attemptedAt: string,
  catalogIds: readonly string[]
): InstallCountsSnapshot {
  return parseInstallCountsSnapshot(
    {
      schemaVersion: INSTALL_COUNTS_SCHEMA_VERSION,
      status: isCurrentInstallCounts(data, attemptedAt) ? "available" : "stale",
      attemptedAt,
      fetchedAt: attemptedAt,
      data,
    },
    catalogIds
  )
}

export function failedInstallCountsSnapshot(
  previous: unknown,
  attemptedAt: string,
  catalogIds: readonly string[]
): InstallCountsSnapshot {
  try {
    const snapshot = parseInstallCountsSnapshot(previous, catalogIds)
    if (
      snapshot.data !== null &&
      snapshot.fetchedAt !== null &&
      snapshot.fetchedAt <= attemptedAt
    ) {
      return parseInstallCountsSnapshot(
        {
          ...snapshot,
          status: "stale",
          attemptedAt,
        },
        catalogIds
      )
    }
  } catch {
    // Invalid generated state cannot be trusted as a stale successful snapshot.
  }

  return parseInstallCountsSnapshot(
    {
      schemaVersion: INSTALL_COUNTS_SCHEMA_VERSION,
      status: "unavailable",
      attemptedAt,
      fetchedAt: null,
      data: null,
    },
    catalogIds
  )
}
