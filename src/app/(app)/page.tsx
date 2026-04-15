import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getRankColor, RANK_COLOR_HEX } from "@/lib/rank";
import { RankPopup } from "@/components/rank-popup";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");

  // Your stats
  const totalBadges = await prisma.badge.count({ where: { active: true } });
  const yourCompletedCount = await prisma.badgeUserStatus.count({
    where: { userId: user.id, isCompleted: true },
  });
  const mySessions = await prisma.session.findMany({
    where: {
      status: { not: "closed" },
      members: { some: { userId: user.id } },
    },
    include: {
      createdBy: { select: { activatePlayerName: true, realName: true, displayNameMode: true } },
      acknowledgements: { where: { userId: user.id }, select: { needsReview: true } },
    },
    orderBy: { sessionDateLocal: "desc" },
  });

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

  const activeSessions: typeof mySessions = [];
  const futureSessions: typeof mySessions = [];
  const pendingReviewSessions: typeof mySessions = [];

  for (const sessionItem of mySessions) {
    const dateLA = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(sessionItem.sessionDateLocal);
    const isFuture = dateLA > today;
    const isPastDate = Date.now() > new Date(sessionItem.expiresAt).getTime();
    const userAck = sessionItem.acknowledgements[0];
    const myReviewDone = userAck ? !userAck.needsReview : false;

    // Primary case: cron has already flipped the status to completed_pending_ack.
    // Fallback: cron hasn't run yet but the expiry window has passed — ensures
    // correct UI behavior even if the daily job is delayed or missed.
    const effectivelyInReview =
      sessionItem.status === "completed_pending_ack" ||
      (sessionItem.status === "active" && isPastDate && !isFuture);

    if (effectivelyInReview && !myReviewDone) {
      pendingReviewSessions.push(sessionItem);
    } else if (isFuture) {
      futureSessions.push(sessionItem);
    } else if (sessionItem.status === "active" && !effectivelyInReview) {
      activeSessions.push(sessionItem);
    }
  }

  function getDisplayName(appUser: { displayNameMode: string; realName: string | null; activatePlayerName: string | null }) {
    return appUser.displayNameMode === "real_name"
      ? appUser.realName ?? appUser.activatePlayerName ?? "Unknown"
      : appUser.activatePlayerName ?? appUser.realName ?? "Unknown";
  }

  const displayName = user.displayNameMode === "real_name"
    ? user.realName ?? user.activatePlayerName ?? "Hunter"
    : user.activatePlayerName ?? user.realName ?? "Hunter";

  const rankColor = getRankColor(user.currentScore);
  const rankHex = RANK_COLOR_HEX[rankColor];
  const completionPct = totalBadges > 0 ? Math.round((yourCompletedCount / totalBadges) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Welcome */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-foreground">Welcome back, {displayName}</h1>
        <p className="mt-2 text-sm text-muted">Track badges, plan sessions, hunt together.</p>
      </div>

      {/* Stats grid — Badges | Score | Rank (mirrors player page) */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{yourCompletedCount}</p>
          <p className="text-xs text-muted">of {totalBadges} badges ({completionPct}%)</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{user.currentScore.toLocaleString()}</p>
          <p className="text-xs text-muted">Score</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <RankPopup currentRank={rankColor} rankHex={rankHex} />
          <p className="text-xs text-muted">Rank</p>
        </div>
      </div>

      {/* Activate detail strip */}
      {(user.leaderboardPosition || user.levelsBeat || user.coins !== null) && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted">
          {user.leaderboardPosition && (
            <span>Leaderboard: <span className="font-semibold text-foreground">{user.leaderboardPosition}</span></span>
          )}
          {user.levelsBeat && (
            <span>Levels Beat: <span className="font-semibold text-foreground">{user.levelsBeat}</span></span>
          )}
          {user.coins !== null && (
            <span>Coins: <span className="font-semibold text-foreground">{user.coins}</span></span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <p className="mt-4 text-xs text-muted">Badge progress</p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${completionPct}%` }} />
      </div>

      {/* Last synced */}
      <p className="mt-3 text-xs text-muted">
        Last synced: {user.lastSyncedAt ? user.lastSyncedAt.toLocaleString() : "Never"}
      </p>

      {/* Sessions */}
      {activeSessions.length + futureSessions.length + pendingReviewSessions.length > 0 ? (
        <div className="mt-6 space-y-4">
          <SessionGroup
            label={`You are in ${activeSessions.length} active session${activeSessions.length !== 1 ? "s" : ""}`}
            sessions={activeSessions}
            borderColor="border-success/30"
            bgColor="bg-success/5"
            hoverColor="hover:bg-success/10"
            textColor="text-success"
            getDisplayName={getDisplayName}
          />
          <SessionGroup
            label={`You are in ${pendingReviewSessions.length} pending review session${pendingReviewSessions.length !== 1 ? "s" : ""}`}
            sessions={pendingReviewSessions}
            borderColor="border-warning/30"
            bgColor="bg-warning/5"
            hoverColor="hover:bg-warning/10"
            textColor="text-warning"
            getDisplayName={getDisplayName}
          />
          <SessionGroup
            label={`You are in ${futureSessions.length} future session${futureSessions.length !== 1 ? "s" : ""}`}
            sessions={futureSessions}
            borderColor="border-accent/30"
            bgColor="bg-accent/5"
            hoverColor="hover:bg-accent/10"
            textColor="text-accent"
            getDisplayName={getDisplayName}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted">No active sessions</p>
        </div>
      )}
    </div>
  );
}

interface SessionGroupProps {
  label: string;
  sessions: {
    id: string;
    sessionDateLocal: Date;
    createdBy: { activatePlayerName: string | null; realName: string | null; displayNameMode: string };
  }[];
  borderColor: string;
  bgColor: string;
  hoverColor: string;
  textColor: string;
  getDisplayName: (u: { displayNameMode: string; realName: string | null; activatePlayerName: string | null }) => string;
}

function SessionGroup({ label, sessions, borderColor, bgColor, hoverColor, textColor, getDisplayName }: SessionGroupProps) {
  if (sessions.length === 0) return null;

  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${textColor}`}>{label}</p>
      <div className={`mt-2 divide-y divide-border rounded-xl border ${borderColor} ${bgColor}`}>
        {sessions.map((userSession) => (
          <Link
            key={userSession.id}
            href={`/sessions/${userSession.id}`}
            className={`flex items-center justify-between px-4 py-3 ${hoverColor} transition-colors`}
          >
            <span className="text-sm text-foreground">
              {userSession.sessionDateLocal.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })}
            </span>
            <span className="text-xs text-muted">by {getDisplayName(userSession.createdBy)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
