import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { getRankColor, RANK_COLOR_HEX } from "@/lib/rank";
import Link from "next/link";

export default async function PlayersPage() {
  const currentUser = await requireUser();
  const isolation = isolationFilter(currentUser);

  const totalBadgeCount = await prisma.badge.count({ where: { active: true } });

  const players = await prisma.user.findMany({
    where: { ...isolation, isActive: true },
    orderBy: { currentScore: "desc" },
    include: {
      _count: {
        select: {
          badgeStatuses: {
            where: { isCompleted: true },
          },
        },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Players</h1>

      <div className="rounded-lg border border-border">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_5rem_5rem_5rem] items-center gap-4 border-b border-border bg-card px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <span>Player</span>
          <span className="text-center">Score</span>
          <span className="text-center">Rank</span>
          <span className="text-center">Badges</span>
        </div>

        {/* Player rows */}
        <div className="divide-y divide-border">
          {players.map((player) => {
            const rankColor = getRankColor(player.currentScore);
            const rankHex = RANK_COLOR_HEX[rankColor];
            const displayName =
              player.displayNameMode === "real_name"
                ? player.realName ?? player.activatePlayerName ?? "Unknown"
                : player.activatePlayerName ?? player.realName ?? "Unknown";
            const completedCount = player._count.badgeStatuses;
            const progressPercent = totalBadgeCount > 0 ? Math.round((completedCount / totalBadgeCount) * 100) : 0;

            return (
              <Link
                key={player.id}
                href={`/players/${player.id}`}
                className={`grid grid-cols-[2fr_5rem_5rem_5rem] items-center gap-4 px-4 py-3 transition-colors hover:bg-card-hover ${
                  player.id === currentUser.id ? "bg-accent/[0.03]" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: rankHex }}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {displayName}
                      </span>
                      {player.id === currentUser.id && (
                        <span className="shrink-0 text-[10px] text-accent">(you)</span>
                      )}
                      {player.isTestUser && (
                        <span className="shrink-0 rounded bg-warning/20 px-1 py-px text-[9px] font-bold text-warning">
                          TEST
                        </span>
                      )}
                      {player.role === "superuser" && (
                        <span className="shrink-0 rounded bg-accent/20 px-1 py-px text-[9px] font-bold text-accent">
                          SU
                        </span>
                      )}
                    </div>
                    {player.activatePlayerName && player.realName && (
                      <span className="text-[10px] text-muted">
                        {player.displayNameMode === "real_name"
                          ? player.activatePlayerName
                          : player.realName}
                      </span>
                    )}
                  </div>
                </div>

                <span className="text-center text-sm tabular-nums text-foreground">
                  {player.currentScore.toLocaleString()}
                </span>

                <span className="text-center text-sm font-medium" style={{ color: rankHex }}>
                  {rankColor}
                </span>

                <div className="text-center">
                  <span className="text-sm tabular-nums text-foreground">
                    {completedCount}
                  </span>
                  <span className="text-[10px] text-muted">
                    /{totalBadgeCount}
                  </span>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {players.length === 0 && (
        <div className="mt-8 text-center text-muted">
          <p>No players yet.</p>
        </div>
      )}
    </div>
  );
}
