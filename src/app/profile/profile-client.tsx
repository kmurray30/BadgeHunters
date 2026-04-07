"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const displayName =
    user.displayNameMode === "real_name"
      ? user.realName ?? user.activatePlayerName ?? "Unknown"
      : user.activatePlayerName ?? user.realName ?? "Unknown";

  const progressPercent = badgeStats.total > 0
    ? Math.round((badgeStats.completed / badgeStats.total) * 100)
    : 0;

  async function handleDisplayModeToggle() {
    const newMode = user.displayNameMode === "player_name" ? "real_name" : "player_name";
    await fetch("/api/profile/display-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Profile</h1>

      {/* User info card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ backgroundColor: user.rankColorHex }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{displayName}</h2>
              {user.isTestUser && (
                <span className="rounded bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">
                  TEST
                </span>
              )}
              {user.role === "superuser" && (
                <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">
                  Superuser
                </span>
              )}
            </div>
            {user.email && <p className="text-sm text-muted">{user.email}</p>}
            {user.activatePlayerName && user.realName && (
              <p className="text-xs text-muted">
                {user.displayNameMode === "player_name"
                  ? `Real name: ${user.realName}`
                  : `Player name: ${user.activatePlayerName}`}
              </p>
            )}
          </div>
        </div>

        {/* Display mode toggle */}
        <div className="mt-4">
          <button
            onClick={handleDisplayModeToggle}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
          >
            Show as {user.displayNameMode === "player_name" ? "real name" : "player name"}
          </button>
        </div>
      </div>

      {/* Score and rank */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">
            {user.currentScore.toLocaleString()}
          </p>
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

      {/* Sync info */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted">
          Last synced: {user.lastSyncedAt ? new Date(user.lastSyncedAt).toLocaleString() : "Never"}
        </p>
        {user.lastScoreSource && (
          <p className="text-xs text-muted">Source: {user.lastScoreSource}</p>
        )}
      </div>

      {/* Recent completions */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h3 className="text-sm font-semibold text-foreground">Recent Completions</h3>
        {recentCompletions.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No badges completed yet.</p>
        ) : (
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
        )}
      </div>
    </div>
  );
}
