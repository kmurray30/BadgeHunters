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

function SyncErrorEntry({ entry }: { entry: ScoreSyncErrorDetail }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {entry.context}
      </p>
      {entry.name ? (
        <p className="mt-1 text-[10px] font-medium text-muted">{entry.name}</p>
      ) : null}
      <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">
        {entry.message}
      </p>
      {entry.cause ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted">
          Cause: {entry.cause}
        </p>
      ) : null}
      {entry.url ? (
        <p className="mt-1 break-all text-xs text-muted">
          URL:{" "}
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {entry.url}
          </a>
        </p>
      ) : null}
      {entry.at ? (
        <p className="mt-1 text-[10px] text-muted">
          {new Date(entry.at).toLocaleString()}
        </p>
      ) : null}
      {entry.stack ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] font-medium text-accent hover:underline">
            Stack trace
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-card px-2 py-1 text-[10px] leading-relaxed text-muted">
            {entry.stack}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function SyncErrorDetails({
  errorDetails,
  errorMessage,
  errorCount,
}: {
  errorDetails: ScoreSyncErrorDetail[];
  errorMessage?: string | null;
  errorCount?: number | null;
}) {
  const hasStoredDetails = errorDetails.length > 0 || Boolean(errorMessage);

  if (!hasStoredDetails) {
    return (
      <p className="mt-3 text-xs text-muted">
        {errorCount && errorCount > 0
          ? "No error details were saved for this run. Run sync again to capture logs."
          : "No error details were recorded."}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {errorMessage ? (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-danger">
            Summary
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground">
            {errorMessage}
          </p>
        </div>
      ) : null}
      {errorDetails.map((entry, index) => (
        <SyncErrorEntry key={`${entry.context}-${index}`} entry={entry} />
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
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [isLoadingErrorDetails, setIsLoadingErrorDetails] = useState(false);

  const pollStatus = useCallback(async (runId: string) => {
    const response = await fetch(`/api/sync/status?runId=${runId}`);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : `Failed to load sync status (${response.status})`,
      );
    }
    return (await response.json()) as SyncRunStatus;
  }, []);

  const applyFinishedRun = useCallback((status: SyncRunStatus) => {
    setLatestFinished(status);
    setActiveRun(null);
    setShowErrorDetails(false);
    if (status.status === "failed" && status.errorMessage) {
      setError(status.errorMessage);
    }
  }, []);

  useEffect(() => {
    if (!activeRun || !["pending", "running"].includes(activeRun.status)) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const status = await pollStatus(activeRun.id);

        setActiveRun(status);

        if (
          status.status === "completed" ||
          status.status === "failed" ||
          status.status === "cancelled"
        ) {
          applyFinishedRun(status);
        }
      } catch (pollError) {
        setError(
          pollError instanceof Error
            ? pollError.message
            : "Failed to load sync status",
        );
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeRun, applyFinishedRun, pollStatus]);

  const isRunning =
    activeRun != null && ["pending", "running"].includes(activeRun.status);

  async function handleStartSync() {
    setIsStarting(true);
    setError(null);
    setShowErrorDetails(false);

    try {
      const response = await fetch("/api/sync/start", { method: "POST" });
      const data = await response.json().catch(() => ({}));

      if (response.status === 409 && data.runId) {
        const status = await pollStatus(data.runId);
        if (["pending", "running"].includes(status.status)) {
          setActiveRun(status);
          setError("A sync is already in progress.");
        } else {
          applyFinishedRun(status);
        }
        return;
      }

      if (!response.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Failed to start sync",
        );
        return;
      }

      if (typeof data.runId !== "string") {
        setError("Sync started but no run id was returned.");
        return;
      }

      const status = await pollStatus(data.runId);
      setActiveRun(status);

      if (
        status.status === "completed" ||
        status.status === "failed" ||
        status.status === "cancelled"
      ) {
        applyFinishedRun(status);
      }
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Failed to start sync",
      );
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

  async function toggleErrorDetails() {
    if (!latestFinished) return;

    if (showErrorDetails) {
      setShowErrorDetails(false);
      return;
    }

    setIsLoadingErrorDetails(true);
    try {
      const status = await pollStatus(latestFinished.id);
      if (status) {
        setLatestFinished(status);
      }
      setShowErrorDetails(true);
    } finally {
      setIsLoadingErrorDetails(false);
    }
  }

  async function handleCancelSync() {
    if (!activeRun) return;

    setIsCancelling(true);
    setError(null);

    try {
      const response = await fetch("/api/sync/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: activeRun.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Failed to cancel sync");
        return;
      }

      if (data.run) {
        setLatestFinished(data.run);
      } else {
        const status = await pollStatus(activeRun.id);
        if (status) setLatestFinished(status);
      }
      setActiveRun(null);
    } catch {
      setError("Failed to cancel sync");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted">
          Syncs overall scores and every level score for all linked players from
          PlayActivate. Also refreshes global top scores for each level. This
          updates everyone in the system, not just you.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={handleStartSync}
            disabled={isRunning || isStarting}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? "Syncing…" : isStarting ? "Starting…" : "Sync Scores"}
          </button>

          {isRunning && activeRun ? (
            <button
              type="button"
              onClick={handleCancelSync}
              disabled={isCancelling}
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCancelling ? "Cancelling…" : "Cancel sync"}
            </button>
          ) : null}
        </div>

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
          latestFinished.status === "failed" ||
          latestFinished.status === "cancelled") && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {latestFinished.status === "failed"
                ? "Last sync failed"
                : latestFinished.status === "cancelled"
                  ? "Last sync cancelled"
                  : "Last sync"}
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
                      onClick={toggleErrorDetails}
                      disabled={isLoadingErrorDetails}
                      className="text-accent hover:underline disabled:opacity-50"
                    >
                      {isLoadingErrorDetails
                        ? "Loading…"
                        : showErrorDetails
                          ? "Hide details"
                          : "View details"}
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
                errorCount={latestFinished.errorCount}
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
