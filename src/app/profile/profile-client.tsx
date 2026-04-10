"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface UserData {
  id: string;
  email: string | null;
  realName: string | null;
  activatePlayerName: string | null;
  displayNameMode: string;
  currentScore: number;
  rankColor: string;
  rankColorHex: string;
  role: string;
  isTestUser: boolean;
  lastSyncedAt: string | null;
  lastScoreSource: string | null;
}

interface BadgeStats {
  completed: number;
  total: number;
}

interface RecentCompletion {
  badgeId: string;
  badgeNumber: number;
  badgeName: string;
  completedAt: string | null;
}

interface Props {
  user: UserData;
  badgeStats: BadgeStats;
  recentCompletions: RecentCompletion[];
}

export function ProfileClient({ user, badgeStats, recentCompletions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);

  const displayName =
    user.displayNameMode === "real_name"
      ? user.realName ?? user.activatePlayerName ?? "Unknown"
      : user.activatePlayerName ?? user.realName ?? "Unknown";

  const progressPercent = badgeStats.total > 0
    ? Math.round((badgeStats.completed / badgeStats.total) * 100)
    : 0;

  const [realNameDraft, setRealNameDraft] = useState(user.realName ?? "");
  const [playerNameDraft, setPlayerNameDraft] = useState(user.activatePlayerName ?? "");
  const [scoreDraft, setScoreDraft] = useState(String(user.currentScore));

  function refresh() {
    startTransition(() => router.refresh());
  }

  function cancelEditing() {
    setRealNameDraft(user.realName ?? "");
    setPlayerNameDraft(user.activatePlayerName ?? "");
    setScoreDraft(String(user.currentScore));
    setIsEditing(false);
  }

  async function saveAll() {
    const parsedScore = Number(scoreDraft);
    if (!Number.isFinite(parsedScore) || parsedScore < 0) return;

    await Promise.all([
      fetch("/api/profile/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName: realNameDraft,
          activatePlayerName: playerNameDraft,
        }),
      }),
      fetch("/api/profile/update-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: parsedScore }),
      }),
    ]);

    setIsEditing(false);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="rounded-lg p-2 text-muted hover:bg-card-hover hover:text-foreground transition-colors"
            aria-label="Edit profile"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={cancelEditing}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveAll}
              disabled={isPending}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {/* User info card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ backgroundColor: user.rankColorHex }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{displayName}</h2>
              {user.isTestUser && (
                <span className="rounded bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">TEST</span>
              )}
              {user.role === "superuser" && (
                <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">Superuser</span>
              )}
            </div>
            {user.email && <p className="text-sm text-muted">{user.email}</p>}

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted w-28 shrink-0">Real Name:</span>
              {isEditing ? (
                <input
                  autoFocus
                  value={realNameDraft}
                  onChange={(event) => setRealNameDraft(event.target.value)}
                  className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                />
              ) : (
                <span className="text-foreground">
                  {user.realName || <span className="text-muted italic">Not set</span>}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted w-28 shrink-0">Activate Name:</span>
              {isEditing ? (
                <input
                  value={playerNameDraft}
                  onChange={(event) => setPlayerNameDraft(event.target.value)}
                  className="rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
                />
              ) : (
                <span className="text-foreground">
                  {user.activatePlayerName || <span className="text-muted italic">Not set</span>}
                </span>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* Score and rank */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          {isEditing ? (
            <input
              inputMode="numeric"
              value={scoreDraft}
              onChange={(event) => setScoreDraft(event.target.value.replace(/[^0-9]/g, ""))}
              className="w-24 rounded border border-border bg-background px-2 py-1 text-center text-lg font-bold text-foreground"
            />
          ) : (
            <p className="text-2xl font-bold text-foreground">{user.currentScore.toLocaleString()}</p>
          )}
          <p className="text-xs text-muted">Score</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold" style={{ color: user.rankColorHex }}>
            {user.rankColor}
          </p>
          <p className="text-xs text-muted">Rank</p>
        </div>
      </div>

      {/* Badge progress */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground">Badge Progress</h3>
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground">
              {badgeStats.completed} / {badgeStats.total}
            </span>
            <span className="text-muted">{progressPercent}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Recent completions */}
      {recentCompletions.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold text-foreground">Recent Completions</h3>
          <div className="mt-3 space-y-2">
            {recentCompletions.map((completion) => (
              <Link
                key={completion.badgeId}
                href={`/badges/${completion.badgeId}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted">#{completion.badgeNumber}</span>
                  <span className="text-sm text-foreground">{completion.badgeName}</span>
                </div>
                {completion.completedAt && (
                  <span className="text-[10px] text-muted">
                    {new Date(completion.completedAt).toLocaleDateString()}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sync info */}
      <p className="text-xs text-muted">
        Last synced: {user.lastSyncedAt ? new Date(user.lastSyncedAt).toLocaleString() : "Never"}
        {user.lastScoreSource && <span> · Source: {user.lastScoreSource}</span>}
      </p>
    </div>
  );
}
