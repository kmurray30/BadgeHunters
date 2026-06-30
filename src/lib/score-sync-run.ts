import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface ScoreSyncErrorDetail {
  context: string;
  message: string;
}

export function formatSyncError(error: unknown): string {
  if (error instanceof Error) {
    if (error instanceof AggregateError && error.errors.length > 0) {
      return error.errors.map(formatSyncError).join("; ");
    }
    const message = error.message?.trim();
    if (message) return message;
    if (error.name) return error.name;
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }

    if (record.message && typeof record.message === "object") {
      return formatSyncError(record.message);
    }

    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }

    if (record.error && typeof record.error === "object") {
      return formatSyncError(record.error);
    }

    const name = typeof record.name === "string" ? record.name : null;
    const code = typeof record.code === "string" ? record.code : null;
    if (name && code) return `${name}: ${code}`;
    if (name) return name;
    if (code) return code;

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") {
        return serialized;
      }
    } catch {
      // Fall through.
    }
  }

  if (error == null) {
    return "Unknown error";
  }

  return String(error);
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
      return { context, message };
    })
    .filter((entry): entry is ScoreSyncErrorDetail => entry != null);
}

export async function recordSyncError(
  runId: string | undefined,
  errorDetails: ScoreSyncErrorDetail[],
  context: string,
  error: unknown,
): Promise<number> {
  errorDetails.push({
    context,
    message: formatSyncError(error),
  });

  if (runId) {
    await prisma.scoreSyncRun.update({
      where: { id: runId },
      data: {
        errorCount: errorDetails.length,
        errorDetails: errorDetailsForDb(errorDetails),
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
  syncedCount: number | null;
  notFoundCount: number | null;
  errorCount: number | null;
  startedAt: Date;
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
    syncedCount: run.syncedCount,
    notFoundCount: run.notFoundCount,
    errorCount: run.errorCount,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}
