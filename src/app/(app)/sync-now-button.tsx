"use client";

import { useSyncRun } from "@/hooks/use-sync-run";

/** Starts a full sync (or joins the one already running) and refreshes the page when it finishes. */
export function SyncNowButton() {
  const { state, start } = useSyncRun();

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={start}
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
