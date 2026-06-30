import { prisma } from "@/lib/db";
import { roomSlugSortIndex } from "@/lib/activate-config";

export interface LevelCellData {
  level: number;
  score?: number;
  topScore?: number;
  completedCount?: number;
  totalSelected?: number;
  completedPlayers?: string[];
}

export interface LevelGameRow {
  id: number;
  name: string;
  levels: LevelCellData[];
}

export interface LevelRoomGroup {
  slug: string;
  name: string;
  games: LevelGameRow[];
}

export interface LevelsGridPayload {
  rooms: LevelRoomGroup[];
  hasData: boolean;
}

const LEVEL_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export async function fetchActivateGamesCatalog() {
  return prisma.activateGame.findMany({
    orderBy: [{ roomSlug: "asc" }, { sortIndex: "asc" }, { name: "asc" }],
  });
}

export async function buildMyScoresGrid(userId: string): Promise<LevelsGridPayload> {
  const games = await fetchActivateGamesCatalog();

  if (games.length === 0) {
    return { rooms: [], hasData: false };
  }

  const [userScores, globalTops] = await Promise.all([
    prisma.userLevelScore.findMany({ where: { userId } }),
    prisma.globalLevelTopScore.findMany(),
  ]);

  const userScoreMap = new Map(
    userScores.map((row) => [`${row.gameId}-${row.level}`, row.score]),
  );
  const globalTopMap = new Map(
    globalTops.map((row) => [`${row.gameId}-${row.level}`, row.topScore]),
  );

  return buildGridFromGames(games, (gameId) =>
    LEVEL_NUMBERS.map((level) => ({
      level,
      score: userScoreMap.get(`${gameId}-${level}`) ?? 0,
      topScore: globalTopMap.get(`${gameId}-${level}`) ?? undefined,
    })),
  );
}

export async function buildGroupCompletionGrid(
  playerIds: string[],
): Promise<LevelsGridPayload> {
  const games = await fetchActivateGamesCatalog();

  if (games.length === 0) {
    return { rooms: [], hasData: false };
  }

  if (playerIds.length === 0) {
    return buildGridFromGames(games, () =>
      LEVEL_NUMBERS.map((level) => ({
        level,
        completedCount: 0,
        totalSelected: 0,
        completedPlayers: [],
      })),
    );
  }

  const selectedPlayers = await prisma.user.findMany({
    where: { id: { in: playerIds } },
    select: groupCompletionPlayerSelect,
  });

  const abbreviationByUserId = new Map(
    selectedPlayers.map((player) => [
      player.id,
      playerUsernameAbbreviation(player),
    ]),
  );

  const completionScores = await prisma.userLevelScore.findMany({
    where: {
      userId: { in: playerIds },
      score: { gt: 0 },
    },
    select: { gameId: true, level: true, userId: true },
  });

  const completionUserMap = new Map<string, string[]>();
  for (const row of completionScores) {
    const key = `${row.gameId}-${row.level}`;
    const userIds = completionUserMap.get(key) ?? [];
    userIds.push(row.userId);
    completionUserMap.set(key, userIds);
  }

  const totalSelected = playerIds.length;

  return buildGridFromGames(games, (gameId) =>
    LEVEL_NUMBERS.map((level) => {
      const userIds = completionUserMap.get(`${gameId}-${level}`) ?? [];
      const uniqueUserIds = [...new Set(userIds)];
      const completedPlayers = uniqueUserIds
        .map((userId) => abbreviationByUserId.get(userId))
        .filter((abbreviation): abbreviation is string => Boolean(abbreviation))
        .sort();
      return {
        level,
        completedCount: uniqueUserIds.length,
        totalSelected,
        completedPlayers,
      };
    }),
  );
}

function buildGridFromGames(
  games: {
    id: number;
    name: string;
    roomSlug: string;
    roomName: string;
    sortIndex: number;
  }[],
  buildLevelsForGame: (gameId: number) => LevelCellData[],
): LevelsGridPayload {
  const roomMap = new Map<string, LevelRoomGroup>();

  for (const game of games) {
    if (!roomMap.has(game.roomSlug)) {
      roomMap.set(game.roomSlug, {
        slug: game.roomSlug,
        name: game.roomName,
        games: [],
      });
    }

    roomMap.get(game.roomSlug)!.games.push({
      id: game.id,
      name: game.name,
      levels: buildLevelsForGame(game.id),
    });
  }

  const rooms = [...roomMap.values()].sort(
    (roomA, roomB) => roomSlugSortIndex(roomA.slug) - roomSlugSortIndex(roomB.slug),
  );

  return { rooms, hasData: true };
}

/** Level baseline subtracted from raw scores to compute score potential. */
export function computeScorePotential(
  level: number,
  score: number,
  topScore: number,
): number | null {
  const levelBaseline = level * 1000;
  const adjustedScore = score - levelBaseline;
  const adjustedTop = topScore - levelBaseline;

  if (adjustedTop <= 0) {
    return null;
  }

  return Math.min(1, Math.max(0, adjustedScore / adjustedTop));
}

/** Background color for My Scores cells (gradient driven by score potential %) */
export function myScoreCellBackground(
  level: number,
  score: number,
  topScore?: number,
): string {
  if (score <= 0) return "#ffffff";
  if (topScore != null && topScore > 0 && score >= topScore) {
    return "#d946ef";
  }

  if (topScore == null || topScore <= 0) {
    return "#86efac";
  }

  const potential =
    computeScorePotential(level, score, topScore) ??
    Math.min(1, Math.max(0, score / topScore));

  return myScoreRatioBackground(potential);
}

export function myScoreIsGlobalTop(score: number, topScore?: number): boolean {
  return score > 0 && topScore != null && topScore > 0 && score >= topScore;
}

type RgbTriplet = readonly [number, number, number];

const MY_SCORE_COLOR_STOPS: { ratio: number; color: RgbTriplet }[] = [
  { ratio: 0, color: [252, 165, 165] },
  { ratio: 0.5, color: [253, 224, 71] },
  { ratio: 0.75, color: [253, 186, 116] },
  { ratio: 1, color: [134, 239, 172] },
];

function lerpChannel(start: number, end: number, amount: number): number {
  return Math.round(start + (end - start) * amount);
}

function lerpRgbColor(start: RgbTriplet, end: RgbTriplet, amount: number): string {
  const red = lerpChannel(start[0], end[0], amount);
  const green = lerpChannel(start[1], end[1], amount);
  const blue = lerpChannel(start[2], end[2], amount);
  return `rgb(${red}, ${green}, ${blue})`;
}

function myScoreRatioBackground(ratio: number): string {
  for (let index = 0; index < MY_SCORE_COLOR_STOPS.length - 1; index++) {
    const startStop = MY_SCORE_COLOR_STOPS[index];
    const endStop = MY_SCORE_COLOR_STOPS[index + 1];

    if (ratio >= startStop.ratio && ratio <= endStop.ratio) {
      const span = endStop.ratio - startStop.ratio;
      const amount = span === 0 ? 0 : (ratio - startStop.ratio) / span;
      return lerpRgbColor(startStop.color, endStop.color, amount);
    }
  }

  return "rgb(134, 239, 172)";
}

/** Background for Group Completion cells (white at 0% → black at 100%) */
export function groupCompletionCellBackground(
  completedCount: number,
  totalSelected: number,
): string {
  if (totalSelected <= 0 || completedCount <= 0) return "#ffffff";
  const ratio = Math.min(1, completedCount / totalSelected);
  const gray = Math.round(255 - ratio * 255);
  return `rgb(${gray}, ${gray}, ${gray})`;
}

export function groupCompletionTextColor(
  completedCount: number,
  totalSelected: number,
): string {
  if (totalSelected <= 0) return "inherit";
  const ratio = completedCount / totalSelected;
  return ratio >= 0.5 ? "#ffffff" : "inherit";
}

export function playerUsernameAbbreviation(player: {
  activatePlayerName: string | null;
  realName: string | null;
}): string {
  const username = player.activatePlayerName ?? player.realName ?? "?";
  return username.slice(0, 3);
}

export function formatGroupCompletionCellLabel(
  completedPlayers: string[],
  totalSelected: number,
): string {
  if (completedPlayers.length === 0) return "";
  if (totalSelected > 0 && completedPlayers.length >= totalSelected) {
    return "all";
  }
  return completedPlayers.join(",");
}

export interface GroupCompletionPlayerOption {
  id: string;
  displayName: string;
  isSynced: boolean;
}

export function computePlayerIsSynced(player: {
  activatePlayerName: string | null;
  levelScoreCount: number;
  lastSyncedAt: Date | null;
  lastScoreSource: string | null;
  currentScore: number;
}): boolean {
  if (!player.activatePlayerName) return false;
  if (player.levelScoreCount > 0) return true;
  if (player.currentScore > 0) return true;
  if (player.lastSyncedAt != null) return true;
  return false;
}

export function buildGroupCompletionPlayerOption(player: {
  id: string;
  displayNameMode: string;
  realName: string | null;
  activatePlayerName: string | null;
  lastSyncedAt: Date | null;
  lastScoreSource: string | null;
  currentScore: number;
  _count: { userLevelScores: number };
}): GroupCompletionPlayerOption {
  return {
    id: player.id,
    displayName:
      player.displayNameMode === "real_name"
        ? player.realName ?? player.activatePlayerName ?? "Unknown"
        : player.activatePlayerName ?? player.realName ?? "Unknown",
    isSynced: computePlayerIsSynced({
      activatePlayerName: player.activatePlayerName,
      levelScoreCount: player._count.userLevelScores,
      lastSyncedAt: player.lastSyncedAt,
      lastScoreSource: player.lastScoreSource,
      currentScore: player.currentScore,
    }),
  };
}

export const groupCompletionPlayerSelect = {
  id: true,
  displayNameMode: true,
  realName: true,
  activatePlayerName: true,
  lastSyncedAt: true,
  lastScoreSource: true,
  currentScore: true,
  _count: {
    select: { userLevelScores: true },
  },
} as const;

export type GroupCompletionPlayerRow = {
  id: string;
  displayNameMode: string;
  realName: string | null;
  activatePlayerName: string | null;
  lastSyncedAt: Date | null;
  lastScoreSource: string | null;
  currentScore: number;
  _count: { userLevelScores: number };
};

export function mapGroupCompletionPlayers(
  players: GroupCompletionPlayerRow[],
): GroupCompletionPlayerOption[] {
  return players.map(buildGroupCompletionPlayerOption);
}
