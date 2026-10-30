import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { RANK_COLOR_HEX } from "@/lib/rank";
import { loadRoster } from "@/lib/roster";
import { BackButton } from "@/components/back-button";
import { parseBackFromQuery } from "@/lib/back-navigation";
import { CompareButton } from "./compare-button";
import { RemovePlayerButton } from "../remove-player-button";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}

export default async function PlayerDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const fromContext = parseBackFromQuery((await searchParams).from);
  const currentUser = await requireUser();

  const player = (await loadRoster(currentUser)).find((rosterPlayer) => rosterPlayer.id === id);
  if (!player) notFound();

  const [details, totalBadges, completedBadges, gameCount, levelsBeaten] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id },
      select: { leaderboardPosition: true, coins: true, lastSyncedAt: true, activatePlayerName: true, realName: true },
    }),
    prisma.badge.count({ where: { active: true } }),
    prisma.badgeUserStatus.findMany({
      where: { userId: id, isCompleted: true, badge: { active: true } },
      orderBy: { badge: { name: "asc" } },
      select: { badge: { select: { id: true, name: true, description: true } } },
    }),
    prisma.activateGame.count({ where: { isActive: true } }),
    prisma.userLevelScore.count({ where: { userId: id, score: { gt: 0 }, game: { isActive: true } } }),
  ]);

  const rankHex = RANK_COLOR_HEX[player.rankColor];
  const otherName = details.realName && details.activatePlayerName
    ? player.name === details.realName ? details.activatePlayerName : details.realName
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5">
      <BackButton fallback={fromContext?.path ?? "/players"} label={fromContext?.label ?? "Players"} />

      <section className="panel mt-3 p-5" style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${player.color} 35%, transparent)` }}>
        <div className="flex items-center gap-4">
          <span
            className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-3xl font-bold text-black"
            style={{ backgroundColor: player.color, boxShadow: `0 0 24px color-mix(in srgb, ${player.color} 50%, transparent)` }}
          >
            {player.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="font-display truncate text-2xl font-bold uppercase tracking-wide">
              {player.name}
              {player.isMe && <span className="ml-2 align-middle text-xs font-medium normal-case text-muted">you</span>}
            </h1>
            {otherName && <p className="text-sm text-muted">{otherName}</p>}
            {!player.hasAccount && (
              <div className="mt-1 flex items-center gap-2">
                <p className="text-xs text-muted">Added by a friend · hasn’t signed up yet</p>
                <RemovePlayerButton playerId={player.id} name={player.name} redirectTo="/players" />
              </div>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Score" value={player.currentScore.toLocaleString()} color={rankHex} />
          <Stat label="Rank" value={player.rankColor} color={rankHex} />
          <Stat label="Badges" value={`${completedBadges.length}/${totalBadges}`} />
          <Stat label="Levels" value={`${levelsBeaten}/${gameCount * 10}`} />
        </dl>
        {(details.leaderboardPosition || details.coins != null) && (
          <p className="mt-3 text-xs text-muted">
            {details.leaderboardPosition && <>Leaderboard {details.leaderboardPosition}</>}
            {details.leaderboardPosition && details.coins != null && " · "}
            {details.coins != null && <>{details.coins} coins</>}
          </p>
        )}
      </section>

      {!player.isMe && (
        <div className="mt-3 flex flex-wrap gap-2">
          <CompareButton playerId={player.id} currentUserId={currentUser.id} href="/badges" label="Compare badges" />
          <CompareButton playerId={player.id} currentUserId={currentUser.id} href="/levels" label="Compare levels" />
        </div>
      )}

      <h2 className="font-display mt-6 mb-2 text-sm font-bold uppercase tracking-wider text-muted">
        Completed badges ({completedBadges.length})
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {completedBadges.map(({ badge }) => (
          <li key={badge.id}>
            <Link href={`/badges/${badge.id}`} prefetch={false} className="panel block h-full p-3 transition hover:border-accent/40">
              <p className="font-display font-bold uppercase leading-tight">{badge.name}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{badge.description}</p>
            </Link>
          </li>
        ))}
      </ul>
      {completedBadges.length === 0 && <div className="panel p-6 text-center text-sm text-muted">No badges yet.</div>}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-xl bg-background/60 px-3 py-2.5">
      <dt className="text-[11px] font-semibold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="font-display mt-0.5 text-lg font-bold tabular-nums" style={color ? { color } : undefined}>
        {value}
      </dd>
    </div>
  );
}
