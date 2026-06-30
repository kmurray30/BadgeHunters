import { requireUser } from "@/lib/session-helpers";
import {
  getActiveScoreSyncRun,
  getLatestFinishedScoreSyncRun,
  type ScoreSyncErrorDetail,
} from "@/lib/score-sync";
import { SyncClient } from "./sync-client";

function parseErrorDetails(value: unknown): ScoreSyncErrorDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ScoreSyncErrorDetail =>
      typeof entry === "object" &&
      entry != null &&
      typeof (entry as ScoreSyncErrorDetail).context === "string" &&
      typeof (entry as ScoreSyncErrorDetail).message === "string",
  );
}

function toRunStatus(run: {
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

export default async function SyncPage() {
  await requireUser();

  const [activeRun, latestFinished] = await Promise.all([
    getActiveScoreSyncRun(),
    getLatestFinishedScoreSyncRun(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Sync Scores</h1>
      <p className="mb-6 text-sm text-muted">
        Pull the latest scores from playactivate.com for everyone in the group.
      </p>
      <SyncClient
        initialActiveRun={activeRun ? toRunStatus(activeRun) : null}
        initialLatestFinished={
          latestFinished ? toRunStatus(latestFinished) : null
        }
      />
    </div>
  );
}
