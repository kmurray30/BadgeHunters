"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export type SyncState =
  | { phase: "idle" }
  | { phase: "running"; label: string }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 1500;

/** Starts a full sync (or joins the one already running) and refreshes the page when it finishes. */
export function useSyncRun() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ phase: "idle" });

  const start = useCallback(async () => {
    setState({ phase: "running", label: "Starting…" });
    try {
      const startResponse = await fetch("/api/sync/start", { method: "POST" });
      const started = await startResponse.json().catch(() => ({}));
      const runId: string | undefined = started.runId;
      if (!runId) throw new Error(started.error ?? "Couldn't start the sync");

      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        const status = await (await fetch(`/api/sync/status?runId=${runId}`)).json();
        if (status.awaitingContinuation) {
          await fetch("/api/sync/continue", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId }),
          });
        }
        if (status.status === "pending" || status.status === "running") {
          setState({ phase: "running", label: `${status.completedSteps ?? 0}/${status.totalSteps || "…"}` });
          continue;
        }
        if (status.status === "completed") {
          const errors = status.errorCount ? `, ${status.errorCount} errors` : "";
          setState({ phase: "done", message: `Synced ${status.syncedCount ?? 0} players${errors}` });
          router.refresh();
        } else {
          setState({ phase: "error", message: status.errorMessage ?? `Sync ${status.status}` });
        }
        return;
      }
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "Sync failed" });
    }
  }, [router]);

  return { state, start };
}
