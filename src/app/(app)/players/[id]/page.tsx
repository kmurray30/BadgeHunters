import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { getRankColor, RANK_COLOR_HEX } from "@/lib/rank";
import { notFound } from "next/navigation";
import { RankPopup } from "@/components/rank-popup";
import { BackButton } from "@/components/back-button";
import { parseBackFromQuery } from "@/lib/back-navigation";
import { PlayerBadgesClient } from "./player-badges-client";

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
    orderBy: { badgeId: "asc" },
    include: {
      badge: {
        select: {
          id: true,
          badgeNumber: true,
          name: true,
          description: true,
          defaultDifficulty: true,
          playerCountBucket: true,
          isPerVisit: true,
          isMetaBadge: true,
          userStatuses: {
            where: { user: isolation },
            select: {
              userId: true,
              isCompleted: true,
              isTodo: true,
              personalDifficulty: true,
              idealPlayerCountBucket: true,
            },
          },
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

      {/* Activate details */}
      {(player.leaderboardPosition || player.levelsBeat || player.coins !== null) && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted">
          {player.leaderboardPosition && (
            <span>Leaderboard: <span className="font-semibold text-foreground">{player.leaderboardPosition}</span></span>
          )}
          {player.levelsBeat && (
            <span>Levels Beat: <span className="font-semibold text-foreground">{player.levelsBeat}</span></span>
          )}
          {player.coins !== null && (
            <span>Coins: <span className="font-semibold text-foreground">{player.coins}</span></span>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPercent}%` }} />
      </div>

      {/* Last synced */}
      <p className="mt-3 text-xs text-muted">
        Last synced: {player.lastSyncedAt ? player.lastSyncedAt.toLocaleString() : "Never"}
      </p>

      {/* Completed badges list */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Completed Badges ({completedCount})
        </h2>
        <PlayerBadgesClient
          isOwnProfile={currentUser.id === player.id}
          badges={completedBadges.map((status) => {
            const currentUserStatus = status.badge.userStatuses.find((s) => s.userId === currentUser.id);
            const playerStatus = status.badge.userStatuses.find((s) => s.userId === player.id);
            return {
              id: status.id,
              badgeId: status.badge.id,
              badgeName: status.badge.name,
              badgeNumber: status.badge.badgeNumber,
              description: status.badge.description,
              isPerVisit: status.badge.isPerVisit,
              isMetaBadge: status.badge.isMetaBadge,
              completedAt: status.completedAt?.toISOString() ?? null,
              defaultDifficulty: status.badge.defaultDifficulty,
              playerCountBucket: status.badge.playerCountBucket,
              playerDifficulty: playerStatus?.personalDifficulty ?? null,
              playerPlayerCount: playerStatus?.idealPlayerCountBucket ?? null,
              currentUserDifficulty: currentUserStatus?.personalDifficulty ?? null,
              currentUserPlayerCount: currentUserStatus?.idealPlayerCountBucket ?? null,
              communityDifficultyVotes: status.badge.userStatuses
                .map((s) => s.personalDifficulty)
                .filter(Boolean) as string[],
              communityPlayerCountVotes: status.badge.userStatuses
                .map((s) => s.idealPlayerCountBucket)
                .filter(Boolean) as string[],
              doneByCurrentUser: currentUserStatus?.isCompleted ?? false,
              todoByCurrentUser: currentUserStatus?.isTodo ?? false,
            };
          })}
        />
      </div>
    </div>
  );
}
