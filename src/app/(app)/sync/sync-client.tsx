"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ScoreSyncErrorDetail } from "@/lib/score-sync";

interface SyncRunStatus {
  id: string;
  status: string;
  completedSteps: number;
  totalSteps: number;
  currentLabel: string | null;
  percent: number;
  errorMessage?: string | null;
  errorDetails?: ScoreSyncErrorDetail[];
  syncedCount?: number | null;
  notFoundCount?: number | null;
  errorCount?: number | null;
  startedAt?: string;
  completedAt?: string | null;
}

interface SyncClientProps {
  initialActiveRun: SyncRunStatus | null;
  initialLatestFinished: SyncRunStatus | null;
}

function SyncErrorDetails({
  errorDetails,
  errorMessage,
}: {
  errorDetails: ScoreSyncErrorDetail[];
  errorMessage?: string | null;
}) {
  const hasErrors = errorDetails.length > 0 || Boolean(errorMessage);

  if (!hasErrors) {
    return (
      <p className="mt-3 text-xs text-muted">No error details were recorded.</p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {errorMessage ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-danger">
            Fatal error
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">
            {errorMessage}
          </p>
        </div>
      ) : null}
      {errorDetails.map((entry, index) => (
        <div
          key={`${entry.context}-${index}`}
          className="rounded-lg border border-border bg-background px-3 py-2"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {entry.context}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">
            {entry.message}
          </p>
        </div>
      ))}
    </div>
  );
}

export function SyncClient({
  initialActiveRun,
  initialLatestFinished,
}: SyncClientProps) {
  const [activeRun, setActiveRun] = useState<SyncRunStatus | null>(initialActiveRun);
  const [latestFinished, setLatestFinished] = useState<SyncRunStatus | null>(
    initialLatestFinished,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const pollStatus = useCallback(async (runId: string) => {
    const response = await fetch(`/api/sync/status?runId=${runId}`);
    if (!response.ok) return null;
    return (await response.json()) as SyncRunStatus;
  }, []);

  useEffect(() => {
    if (!activeRun || !["pending", "running"].includes(activeRun.status)) {
      return;
    }

    const intervalId = setInterval(async () => {
      const status = await pollStatus(activeRun.id);
      if (!status) return;

      setActiveRun(status);

      if (status.status === "completed" || status.status === "failed") {
        setLatestFinished(status);
        setShowErrorDetails(false);
        if (status.status === "failed" && status.errorMessage) {
          setError(status.errorMessage);
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeRun, pollStatus]);

  const isRunning =
    activeRun != null && ["pending", "running"].includes(activeRun.status);

  async function handleStartSync() {
    setIsStarting(true);
    setError(null);
    setShowErrorDetails(false);

    try {
      const response = await fetch("/api/sync/start", { method: "POST" });
      const data = await response.json();

      if (response.status === 409 && data.runId) {
        const status = await pollStatus(data.runId);
        if (status) setActiveRun(status);
        return;
      }

      if (!response.ok) {
        setError(data.error ?? "Failed to start sync");
        return;
      }

      const status = await pollStatus(data.runId);
      if (status) {
        setActiveRun(status);
      }
    } catch {
      setError("Failed to start sync");
    } finally {
      setIsStarting(false);
    }
  }

  const progressPercent = activeRun?.percent ?? 0;
  const finishedRunHasErrors =
    latestFinished != null &&
    ((latestFinished.errorCount ?? 0) > 0 ||
      latestFinished.status === "failed" ||
      (latestFinished.errorDetails?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted">
          Syncs overall scores and every level score for all linked players from
          PlayActivate. Also refreshes global top scores for each level. This
          updates everyone in the system, not just you.
        </p>

        <button
          onClick={handleStartSync}
          disabled={isRunning || isStarting}
          className="mt-4 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRunning ? "Syncing…" : isStarting ? "Starting…" : "Sync Scores"}
        </button>

        {isRunning && activeRun && (
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>{activeRun.currentLabel ?? "Working…"}</span>
              <span>
                {activeRun.completedSteps} / {activeRun.totalSteps} ({progressPercent}%)
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-danger">{error}</p>
        )}
      </div>

      {latestFinished &&
        (latestFinished.status === "completed" ||
          latestFinished.status === "failed") && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {latestFinished.status === "failed" ? "Last sync failed" : "Last sync"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {latestFinished.completedAt
                ? new Date(latestFinished.completedAt).toLocaleString()
                : "Recently"}
            </p>
            <ul className="mt-3 space-y-1 text-sm text-foreground">
              <li>{latestFinished.syncedCount ?? 0} players synced</li>
              <li>{latestFinished.notFoundCount ?? 0} not found</li>
              <li>
                {latestFinished.errorCount ?? 0} errors
                {finishedRunHasErrors ? (
                  <>
                    {" "}
                    (
                    <button
                      type="button"
                      onClick={() => setShowErrorDetails((previous) => !previous)}
                      className="text-accent hover:underline"
                    >
                      {showErrorDetails ? "Hide details" : "View details"}
                    </button>
                    )
                  </>
                ) : null}
              </li>
            </ul>

            {showErrorDetails && latestFinished ? (
              <SyncErrorDetails
                errorDetails={latestFinished.errorDetails ?? []}
                errorMessage={latestFinished.errorMessage}
              />
            ) : null}

            {latestFinished.status === "completed" ? (
              <Link
                href="/levels/scores"
                className="mt-4 inline-block text-sm text-accent hover:underline"
              >
                View level scores →
              </Link>
            ) : null}
          </div>
        )}
    </div>
  );
}
