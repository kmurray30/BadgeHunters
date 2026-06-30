import { requireUser } from "@/lib/session-helpers";
import {
  getActiveScoreSyncRun,
  getLatestFinishedScoreSyncRun,
} from "@/lib/score-sync";
import { toSyncRunStatus } from "@/lib/score-sync-run";
import { SyncClient } from "./sync-client";

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
        initialActiveRun={activeRun ? toSyncRunStatus(activeRun) : null}
        initialLatestFinished={
          latestFinished ? toSyncRunStatus(latestFinished) : null
        }
      />
    </div>
  );
}
