import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { getRankColor, RANK_COLOR_HEX } from "@/lib/rank";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RankPopup } from "@/components/rank-popup";
import { BackButton } from "@/components/back-button";
import { parseBackFromQuery } from "@/lib/back-navigation";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}

export default async function PlayerDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const fromContext = parseBackFromQuery(query.from);
  const backFallback = fromContext?.path ?? "/players";
  const backLabel = fromContext?.label ?? "Players";
  const currentUser = await requireUser();
  const isolation = isolationFilter(currentUser);

  const player = await prisma.user.findUnique({
    where: { id },
  });

  if (!player || player.isTestUser !== currentUser.isTestUser) {
    notFound();
  }

  const totalBadgeCount = await prisma.badge.count({ where: { active: true } });

  const completedBadges = await prisma.badgeUserStatus.findMany({
    where: { userId: player.id, isCompleted: true },
    orderBy: { completedAt: "desc" },
    include: {
      badge: {
        select: {
          id: true,
          badgeNumber: true,
          name: true,
          defaultDifficulty: true,
          isPerVisit: true,
        },
      },
    },
  });

  const rankColor = getRankColor(player.currentScore);
  const rankHex = RANK_COLOR_HEX[rankColor];
  const displayName =
    player.displayNameMode === "real_name"
      ? player.realName ?? player.activatePlayerName ?? "Unknown"
      : player.activatePlayerName ?? player.realName ?? "Unknown";
  const completedCount = completedBadges.length;
  const progressPercent = totalBadgeCount > 0 ? Math.round((completedCount / totalBadgeCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <BackButton fallback={backFallback} label={backLabel} />

      {/* Player header */}
      <div className="mt-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-white"
            style={{ backgroundColor: rankHex }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
              {player.id === currentUser.id && (
                <span className="text-xs text-accent">(you)</span>
              )}
              {player.isTestUser && (
                <span className="rounded bg-warning/20 px-2 py-0.5 text-xs font-bold text-warning">TEST</span>
              )}
              {player.role === "superuser" && (
                <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-bold text-accent">Superuser</span>
              )}
            </div>
            {player.activatePlayerName && player.realName && (
              <p className="text-xs text-muted">
                {player.displayNameMode === "real_name"
                  ? `Player: ${player.activatePlayerName}`
                  : `Name: ${player.realName}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{player.currentScore.toLocaleString()}</p>
          <p className="text-xs text-muted">Score</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <RankPopup currentRank={rankColor} rankHex={rankHex} />
          <p className="text-xs text-muted">Rank</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{completedCount}</p>
          <p className="text-xs text-muted">of {totalBadgeCount} badges ({progressPercent}%)</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPercent}%` }} />
      </div>

      {/* Completed badges list */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Completed Badges ({completedCount})
        </h2>
        {completedCount === 0 ? (
          <p className="text-sm text-muted">No badges completed yet.</p>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {completedBadges.map((status) => (
              <Link
                key={status.id}
                href={`/badges/${status.badge.id}`}
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 text-[10px] font-mono text-muted tabular-nums">
                    {status.badge.badgeNumber}
                  </span>
                  <span className="truncate text-foreground">{status.badge.name}</span>
                  {status.badge.isPerVisit && (
                    <span className="shrink-0 rounded bg-accent/20 px-1 py-px text-[9px] text-accent">visit</span>
                  )}
                </div>
                {status.completedAt && (
                  <span className="shrink-0 text-[10px] text-muted">
                    {new Date(status.completedAt).toLocaleDateString()}
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
