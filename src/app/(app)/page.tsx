import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isolationFilter } from "@/lib/isolation";

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

  const isolation = isolationFilter(user);

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

  // Categorize sessions considering the new per-user review model.
  // "Effectively in review" = explicitly completed_pending_ack OR active but past date.
  const activeSessions: typeof mySessions = [];
  const futureSessions: typeof mySessions = [];
  const pendingReviewSessions: typeof mySessions = [];

  for (const sessionItem of mySessions) {
    const dateLA = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(sessionItem.sessionDateLocal);
    const isFuture = dateLA > today;
    const isPastDate = Date.now() > new Date(sessionItem.expiresAt).getTime();
    const userAck = sessionItem.acknowledgements[0];
    const myReviewDone = userAck ? !userAck.needsReview : false;

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
    // Sessions where the user has already completed their review are excluded from the landing page
  }

  // Other players summary
  const otherPlayers = await prisma.user.findMany({
    where: { ...isolation, isActive: true, id: { not: user.id } },
    select: {
      id: true,
      activatePlayerName: true,
      realName: true,
      displayNameMode: true,
      currentScore: true,
      _count: { select: { badgeStatuses: { where: { isCompleted: true } } } },
    },
    orderBy: { currentScore: "desc" },
    take: 5,
  });

  function getDisplayName(appUser: { displayNameMode: string; realName: string | null; activatePlayerName: string | null }) {
    return appUser.displayNameMode === "real_name"
      ? appUser.realName ?? appUser.activatePlayerName ?? "Unknown"
      : appUser.activatePlayerName ?? appUser.realName ?? "Unknown";
  }

  const displayName = user.displayNameMode === "real_name"
    ? user.realName ?? user.activatePlayerName ?? "Hunter"
    : user.activatePlayerName ?? user.realName ?? "Hunter";

  const completionPct = totalBadges > 0 ? Math.round((yourCompletedCount / totalBadges) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-16 pb-10">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Welcome back, {displayName}</h1>
        <p className="mt-2 text-sm text-muted">Track badges, plan sessions, hunt together.</p>
      </div>

      {/* Your stats */}
      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5 text-center">
          <p className="text-3xl font-bold text-accent">{yourCompletedCount}</p>
          <p className="mt-1 text-xs text-muted">Badges completed</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 text-center">
          <p className="text-3xl font-bold text-foreground">{completionPct}%</p>
          <p className="mt-1 text-xs text-muted">of {totalBadges} total</p>
        </div>
      </div>

      {user.currentScore !== null && (
        <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-4 text-center">
          <p className="text-xs text-muted">Your Activate score</p>
          <p className="text-2xl font-bold text-accent">{user.currentScore.toLocaleString()}</p>
          {user.rankColor && (
            <p className="mt-0.5 text-xs text-muted">Rank: {user.rankColor}</p>
          )}
          {(user.leaderboardPosition || user.levelsBeat || user.coins !== null) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 text-xs text-muted">
              {user.leaderboardPosition && (
                <span>Leaderboard: <span className="font-medium">{user.leaderboardPosition}</span></span>
              )}
              {user.levelsBeat && (
                <span>Levels: <span className="font-medium">{user.levelsBeat}</span></span>
              )}
              {user.coins !== null && (
                <span>Coins: <span className="font-medium">{user.coins}</span></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Session groups */}
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
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted">No active sessions</p>
        </div>
      )}

      {/* Other players */}
      {otherPlayers.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Top Players</h2>
          <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
            {otherPlayers.map((player) => (
              <Link
                key={player.id}
                href={`/players/${player.id}?from=${encodeURIComponent("/")}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-card-hover transition-colors"
              >
                <span className="text-sm text-foreground">{getDisplayName(player)}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted">{player._count.badgeStatuses} badges</span>
                  {player.currentScore !== null && (
                    <span className="text-xs text-accent">{player.currentScore.toLocaleString()} pts</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
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
