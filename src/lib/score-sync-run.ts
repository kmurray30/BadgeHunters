import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildSyncErrorSnapshot } from "@/lib/sync-error-format";
import { parseSyncProgress, type SyncProgressSnapshot } from "@/lib/sync-progress";

export { formatSyncError, buildSyncErrorSnapshot } from "@/lib/sync-error-format";
export type { SyncErrorSnapshot } from "@/lib/sync-error-format";
export type { SyncProgressSnapshot, SyncPlayerProgressItem, SyncRoomProgressItem, SyncItemStatus } from "@/lib/sync-progress";

export interface ScoreSyncErrorDetail {
  context: string;
  message: string;
  name?: string;
  stack?: string;
  cause?: string;
  url?: string;
  at?: string;
}

export function errorDetailsForDb(
  details: ScoreSyncErrorDetail[],
): Prisma.InputJsonValue | undefined {
  if (details.length === 0) return undefined;
  return JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue;
}

export function parseErrorDetails(value: unknown): ScoreSyncErrorDetail[] {
  if (value == null) return [];

  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      if (typeof entry !== "object" || entry == null) return null;
      const record = entry as Record<string, unknown>;
      const context = record.context;
      const message = record.message;
      if (typeof context !== "string" || typeof message !== "string") {
        return null;
      }
      const detail: ScoreSyncErrorDetail = { context, message };
      if (typeof record.name === "string" && record.name) {
        detail.name = record.name;
      }
      if (typeof record.stack === "string" && record.stack) {
        detail.stack = record.stack;
      }
      if (typeof record.cause === "string" && record.cause) {
        detail.cause = record.cause;
      }
      if (typeof record.url === "string" && record.url) {
        detail.url = record.url;
      }
      if (typeof record.at === "string" && record.at) {
        detail.at = record.at;
      }
      return detail;
    })
    .filter((entry): entry is ScoreSyncErrorDetail => entry != null);
}

export async function recordSyncError(
  runId: string | undefined,
  errorDetails: ScoreSyncErrorDetail[],
  context: string,
  error: unknown,
  options?: { url?: string },
): Promise<number> {
  const snapshot = buildSyncErrorSnapshot(error, { url: options?.url });
  errorDetails.push({
    context,
    message: snapshot.message,
    ...(snapshot.name ? { name: snapshot.name } : {}),
    ...(snapshot.stack ? { stack: snapshot.stack } : {}),
    ...(snapshot.cause ? { cause: snapshot.cause } : {}),
    ...(snapshot.url ? { url: snapshot.url } : {}),
    ...(snapshot.at ? { at: snapshot.at } : {}),
  });

  if (runId) {
    await prisma.scoreSyncRun.update({
      where: { id: runId },
      data: {
        errorCount: errorDetails.length,
        errorDetails: errorDetailsForDb(errorDetails),
        lastProgressAt: new Date(),
      },
    });
  }

  return errorDetails.length;
}

export function toSyncRunStatus(run: {
  id: string;
  status: string;
  completedSteps: number;
  totalSteps: number;
  currentLabel: string | null;
  errorMessage: string | null;
  errorDetails: unknown;
  syncProgress: unknown;
  syncedCount: number | null;
  notFoundCount: number | null;
  errorCount: number | null;
  startedAt: Date;
  lastProgressAt: Date;
  completedAt: Date | null;
}) {
  const percent =
    run.totalSteps > 0
      ? Math.round((run.completedSteps / run.totalSteps) * 100)
      : 0;

  return {
    id: run.id,
    status: run.status,
    completedSteps: run.completedSteps,
    totalSteps: run.totalSteps,
    currentLabel: run.currentLabel,
    percent,
    errorMessage: run.errorMessage,
    errorDetails: parseErrorDetails(run.errorDetails),
    syncProgress: parseSyncProgress(run.syncProgress),
    syncedCount: run.syncedCount,
    notFoundCount: run.notFoundCount,
    errorCount: run.errorCount,
    startedAt: run.startedAt.toISOString(),
    lastProgressAt: run.lastProgressAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}
