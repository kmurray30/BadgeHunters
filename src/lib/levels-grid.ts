import { prisma } from "@/lib/db";
import { roomSlugSortIndex } from "@/lib/activate-config";

export const LEVEL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface LevelsGame {
  id: number;
  name: string;
}

export interface LevelsRoom {
  slug: string;
  name: string;
  games: LevelsGame[];
}

/** Everything the Levels page needs, loaded once so the page can filter and switch players instantly. */
export interface LevelsData {
  rooms: LevelsRoom[];
  /** "gameId:level" -> global top score */
  topScores: Record<string, number>;
  /** userId -> "gameId:level" -> that player's best score (only levels they've beaten) */
  scoresByPlayer: Record<string, Record<string, number>>;
}

export function levelKey(gameId: number, level: number): string {
  return `${gameId}:${level}`;
}

export async function loadLevelsData(playerIds: string[]): Promise<LevelsData> {
  const [games, topScores, playerScores] = await Promise.all([
    // Games the sync couldn't place in a room aren't on the floor; leave them out.
    prisma.activateGame.findMany({
      where: { roomSlug: { not: "unknown" } },
      orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
      select: { id: true, name: true, roomSlug: true, roomName: true },
    }),
    prisma.globalLevelTopScore.findMany({ select: { gameId: true, level: true, topScore: true } }),
    prisma.userLevelScore.findMany({
      where: { userId: { in: playerIds }, score: { gt: 0 }, game: { roomSlug: { not: "unknown" } } },
      select: { userId: true, gameId: true, level: true, score: true },
    }),
  ]);

  const roomMap = new Map<string, LevelsRoom>();
  for (const game of games) {
    const room = roomMap.get(game.roomSlug) ?? { slug: game.roomSlug, name: game.roomName, games: [] };
    room.games.push({ id: game.id, name: game.name });
    roomMap.set(game.roomSlug, room);
  }

  const scoresByPlayer: LevelsData["scoresByPlayer"] = Object.fromEntries(playerIds.map((id) => [id, {}]));
  for (const row of playerScores) {
    scoresByPlayer[row.userId][levelKey(row.gameId, row.level)] = row.score;
  }

  return {
    rooms: [...roomMap.values()].sort((roomA, roomB) => roomSlugSortIndex(roomA.slug) - roomSlugSortIndex(roomB.slug)),
    topScores: Object.fromEntries(topScores.map((row) => [levelKey(row.gameId, row.level), row.topScore])),
    scoresByPlayer,
  };
}

/** How close a score is to the top score (0–1), ignoring the per-level baseline everyone gets. */
export function computeScorePotential(level: number, score: number, topScore: number): number | null {
  const levelBaseline = level * 1000;
  const adjustedScore = score - levelBaseline;
  const adjustedTop = topScore - levelBaseline;

  if (adjustedTop <= 0) {
    return null;
  }

  return Math.min(1, Math.max(0, adjustedScore / adjustedTop));
}

const HEAT_STOPS: { ratio: number; rgb: readonly [number, number, number] }[] = [
  { ratio: 0, rgb: [255, 77, 94] },
  { ratio: 0.5, rgb: [255, 210, 63] },
  { ratio: 1, rgb: [61, 255, 160] },
];

/**
 * Tile color for one player's score: red far from the top score, through
 * yellow, to green near it. Null when the level isn't beaten.
 */
export function scoreHeatColor(level: number, score: number | undefined, topScore: number | undefined): string | null {
  if (!score || score <= 0) return null;
  if (!topScore || topScore <= 0) return "rgb(61, 255, 160)";

  const ratio = computeScorePotential(level, score, topScore) ?? Math.min(1, score / topScore);
  for (let index = 0; index < HEAT_STOPS.length - 1; index++) {
    const start = HEAT_STOPS[index];
    const end = HEAT_STOPS[index + 1];
    if (ratio <= end.ratio) {
      const amount = (ratio - start.ratio) / (end.ratio - start.ratio);
      const channel = (channelIndex: number) =>
        Math.round(start.rgb[channelIndex] + (end.rgb[channelIndex] - start.rgb[channelIndex]) * amount);
      return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
    }
  }
  return "rgb(61, 255, 160)";
}

export function isTopScore(score: number | undefined, topScore: number | undefined): boolean {
  return !!score && !!topScore && score >= topScore;
}

/** 12345 -> "12.3k" for tight grid cells */
export function compactScore(score: number): string {
  if (score >= 10_000) return `${Math.round(score / 1000)}k`;
  if (score >= 1000) return `${(score / 1000).toFixed(1)}k`;
  return String(score);
}
