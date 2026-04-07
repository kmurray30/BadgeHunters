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
  const activeSession = await prisma.session.findFirst({
    where: {
      status: "active",
      members: { some: { userId: user.id } },
    },
    select: { id: true },
  });

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
        </div>
      )}

      {/* Active session callout */}
      {activeSession ? (
        <Link href={`/sessions/${activeSession.id}`} className="mt-4 block rounded-xl border border-success/30 bg-success/5 p-4 text-center hover:bg-success/10 transition-colors">
          <p className="text-sm font-medium text-success">You have an active session</p>
          <p className="mt-0.5 text-xs text-muted">Tap to view</p>
        </Link>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted">No active session</p>
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
                href={`/players/${player.id}`}
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
