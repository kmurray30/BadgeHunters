import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RANK_COLOR_HEX } from "@/lib/rank";
import { loadBadgeCards } from "@/lib/badge-cards";
import { LEVEL_NUMBERS, loadLevelsData } from "@/lib/levels-grid";
import { playerRankColor } from "@/lib/player-colors";
import { loadRoster, playerDisplayName } from "@/lib/roster";
import { getLatestFinishedScoreSyncRun } from "@/lib/score-sync";
import { RankPopup } from "@/components/rank-popup";
import { NextUp } from "./next-up";
import { SyncNowButton } from "./sync-now-button";

function timeAgo(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function Home() {
  const session = await auth();

  // Pending user (mid-onboarding) → complete setup first
  if (session?.user?.pendingOnboarding) {
    redirect("/onboarding");
  }

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");

  const roster = await loadRoster(user);
  const rosterIds = roster.map((player) => player.id);
  const [badges, levels, lastRun] = await Promise.all([
    loadBadgeCards(user.id, rosterIds),
    loadLevelsData(rosterIds),
    getLatestFinishedScoreSyncRun(),
  ]);

  const totalLevels = levels.rooms.reduce((sum, room) => sum + room.games.length * LEVEL_NUMBERS.length, 0);
  const badgesDoneBy = (playerId: string) => badges.filter((badge) => badge.doneBy.includes(playerId)).length;
  const levelsBeatenBy = (playerId: string) => Object.keys(levels.scoresByPlayer[playerId] ?? {}).length;

  const rankColor = playerRankColor(user);
  const rankHex = RANK_COLOR_HEX[rankColor];
  const lastSyncedAt = lastRun?.completedAt ?? user.lastSyncedAt;
  const leaderboard = [...roster].sort((playerA, playerB) => playerB.currentScore - playerA.currentScore);

  return (
    <div className="mx-auto max-w-3xl px-4 pt-6">
      <p className="font-display text-sm uppercase tracking-[0.2em] text-muted">Welcome back</p>
      <h1 className="font-display mt-1 text-4xl font-bold uppercase tracking-wide">
        <span className="neon-text">{playerDisplayName(user)}</span>
      </h1>

      <section
        className="panel relative mt-6 overflow-hidden p-5"
        style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${rankHex} 35%, transparent), 0 0 40px color-mix(in srgb, ${rankHex} 18%, transparent)` }}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Score</p>
        <p className="font-display mt-1 text-5xl font-bold tabular-nums" style={{ color: rankHex, textShadow: `0 0 24px ${rankHex}66` }}>
          {user.currentScore.toLocaleString()}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted">Rank</span>
            <RankPopup currentRank={rankColor} rankHex={rankHex} />
          </div>
          {user.leaderboardPosition && (
            <div className="flex items-center gap-2">
              <span className="text-muted">Leaderboard</span>
              <span className="font-display text-lg font-bold">{user.leaderboardPosition}</span>
            </div>
          )}
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <ProgressTile href="/badges" label="Badges" done={badgesDoneBy(user.id)} total={badges.length} color="var(--accent)" />
        <ProgressTile href="/levels" label="Levels" done={levelsBeatenBy(user.id)} total={totalLevels} color="var(--highlight)" />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-4 py-2.5 text-xs text-muted">
        <span>
          {lastSyncedAt ? <>Synced {timeAgo(lastSyncedAt)}</> : "Never synced"}
          {lastRun?.status === "failed" && <span className="text-danger"> · last sync failed</span>}
          <span className="hidden sm:inline"> · syncs every hour</span>
        </span>
        <SyncNowButton />
      </div>

      <NextUp roster={roster} currentUserId={user.id} badges={badges} levels={levels} />

      <section className="panel mt-6 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold uppercase tracking-wider">Leaderboard</h2>
          <Link href="/players" className="text-xs font-semibold text-highlight hover:underline">
            All players
          </Link>
        </div>
        <ol className="space-y-1.5">
          {leaderboard.map((player, index) => (
            <li key={player.id}>
              <Link
                href={`/players/${player.id}`}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-card-hover ${player.isMe ? "bg-accent/10" : "bg-background/60"}`}
              >
                <span className="font-display w-5 text-center font-bold text-muted">{index + 1}</span>
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: player.color, boxShadow: `0 0 8px ${player.color}` }} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {player.name}
                  {player.isMe && <span className="ml-1.5 text-[11px] font-medium text-muted">you</span>}
                </span>
                <span className="hidden text-xs tabular-nums text-muted sm:inline">
                  {badgesDoneBy(player.id)} badges · {levelsBeatenBy(player.id)} levels
                </span>
                <span className="font-display w-20 text-right text-sm font-bold tabular-nums" style={{ color: RANK_COLOR_HEX[player.rankColor] }}>
                  {player.currentScore.toLocaleString()}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function ProgressTile({ href, label, done, total, color }: { href: string; label: string; done: number; total: number; color: string }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Link href={href} className="panel group block p-4 transition hover:border-[color:var(--tile-color)]" style={{ ["--tile-color" as string]: color }}>
      <div className="flex items-baseline justify-between">
        <p className="font-display text-sm font-bold uppercase tracking-wider text-muted group-hover:text-foreground">{label}</p>
        <p className="font-display text-xs text-muted">{percent}%</p>
      </div>
      <p className="font-display mt-2 text-3xl font-bold tabular-nums">
        {done}
        <span className="text-base text-muted"> / {total}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slot-empty">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
    </Link>
  );
}
