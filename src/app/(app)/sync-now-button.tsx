"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncState = { phase: "idle" } | { phase: "running"; label: string } | { phase: "done"; message: string } | { phase: "error"; message: string };

const POLL_INTERVAL_MS = 1500;

/** Starts a full sync (or joins the one already running) and refreshes the page when it finishes. */
export function SyncNowButton() {
  const router = useRouter();
  const [state, setState] = useState<SyncState>({ phase: "idle" });

  async function runSync() {
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
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={runSync}
        disabled={state.phase === "running"}
        className="rounded-lg border border-highlight/50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-highlight transition hover:bg-highlight/10 disabled:opacity-60"
      >
        {state.phase === "running" ? `Syncing ${state.label}` : "Sync now"}
      </button>
      {state.phase === "done" && <span className="text-xs text-success">{state.message}</span>}
      {state.phase === "error" && <span className="text-xs text-danger">{state.message}</span>}
    </span>
  );
}
