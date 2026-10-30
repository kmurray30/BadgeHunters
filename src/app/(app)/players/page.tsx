import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { RANK_COLOR_HEX } from "@/lib/rank";
import { loadRoster } from "@/lib/roster";
import { AddPlayer } from "./add-player";
import { RemovePlayerButton } from "./remove-player-button";

export default async function PlayersPage() {
  const currentUser = await requireUser();
  const roster = await loadRoster(currentUser);
  const rosterIds = roster.map((player) => player.id);

  const [totalBadges, badgeCounts] = await Promise.all([
    prisma.badge.count({ where: { active: true } }),
    prisma.badgeUserStatus.groupBy({
      by: ["userId"],
      where: { userId: { in: rosterIds }, isCompleted: true, badge: { active: true } },
      _count: { _all: true },
    }),
  ]);
  const badgesByUser = new Map(badgeCounts.map((row) => [row.userId, row._count._all]));
  const leaderboard = [...roster].sort((playerA, playerB) => playerB.currentScore - playerA.currentScore);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Players</h1>
        <AddPlayer />
      </div>

      <ol className="space-y-2">
        {leaderboard.map((player, index) => {
          const badges = badgesByUser.get(player.id) ?? 0;
          const percent = totalBadges > 0 ? Math.round((badges / totalBadges) * 100) : 0;
          return (
            <li key={player.id}>
              <Link
                href={`/players/${player.id}`}
                prefetch={false}
                className={`panel flex items-center gap-3 p-3 transition hover:border-accent/40 ${player.isMe ? "border-accent/40" : ""}`}
              >
                <span className="font-display w-6 shrink-0 text-center text-lg font-bold text-muted">{index + 1}</span>
                <span
                  className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-black"
                  style={{ backgroundColor: player.color, boxShadow: `0 0 14px color-mix(in srgb, ${player.color} 45%, transparent)` }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${player.hasAccount ? "" : "text-muted"}`}>
                    {player.name}
                    {player.isMe && <span className="ml-1.5 text-xs font-medium text-muted">you</span>}
                    {!player.hasAccount && <span className="ml-1.5 text-[11px] font-medium">· added</span>}
                    {!player.hasAccount && <RemovePlayerButton playerId={player.id} name={player.name} variant="icon" />}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slot-empty">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {badges}/{totalBadges} badges
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display font-bold tabular-nums">{player.currentScore.toLocaleString()}</p>
                  <p className="text-xs font-semibold" style={{ color: RANK_COLOR_HEX[player.rankColor] }}>
                    {player.rankColor}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>

      {leaderboard.length === 0 && <div className="panel p-8 text-center text-muted">No players yet.</div>}
    </div>
  );
}
