import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { RANK_COLOR_HEX } from "@/lib/rank";
import { playerRankColor } from "@/lib/player-colors";
import { playerDisplayName } from "@/lib/roster";
import { RankPopup } from "@/components/rank-popup";

const LEVELS_PER_GAME = 10;

function formatSyncedAt(date: Date | null): string {
  if (!date) return "Never synced";
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.round(hours / 24)}d ago`;
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

  const [totalBadges, badgesDone, gameCount, levelsDone] = await Promise.all([
    prisma.badge.count({ where: { active: true } }),
    prisma.badgeUserStatus.count({ where: { userId: user.id, isCompleted: true, badge: { active: true } } }),
    prisma.activateGame.count({ where: { roomSlug: { not: "unknown" } } }),
    prisma.userLevelScore.count({ where: { userId: user.id, score: { gt: 0 }, game: { roomSlug: { not: "unknown" } } } }),
  ]);
  const totalLevels = gameCount * LEVELS_PER_GAME;

  const rankColor = playerRankColor(user);
  const rankHex = RANK_COLOR_HEX[rankColor];

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
        <ProgressTile href="/badges" label="Badges" done={badgesDone} total={totalBadges} color="var(--accent)" />
        <ProgressTile href="/levels" label="Levels" done={levelsDone} total={totalLevels} color="var(--highlight)" />
      </div>

      <p className="mt-4 text-center text-xs text-muted">
        {formatSyncedAt(user.lastSyncedAt)} ·{" "}
        <Link href="/sync" className="font-semibold text-highlight hover:underline">
          Sync now
        </Link>
      </p>
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
