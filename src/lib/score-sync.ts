import { withActivateBrowserSession } from "@/lib/activate-browser";
import { ACTIVATE_ROOM_SLUGS } from "@/lib/activate-config";
import {
  activateLevelIdToDisplayLevel,
  parseAllGamesFromScript,
  parseRoomsListFromScript,
  roomNameToSlug,
  type ActivateLevelScoreEntry,
} from "@/lib/activate-parser";
import {
  extractOverallStats,
  fetchPlayerPageData,
  fetchRoomPageData,
} from "@/lib/activate-scraper";
import { prisma } from "@/lib/db";
import { getRankColor } from "@/lib/rank";

export interface ScoreSyncResult {
  synced: number;
  notFound: number;
  errors: number;
}

export interface ScoreSyncErrorDetail {
  context: string;
  message: string;
}

interface SyncProgressCallbacks {
  onProgress?: (completedSteps: number, currentLabel: string) => Promise<void>;
}

function formatSyncError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function updateRunProgress(
  runId: string | undefined,
  completedSteps: number,
  currentLabel: string,
  callbacks?: SyncProgressCallbacks,
) {
  if (callbacks?.onProgress) {
    await callbacks.onProgress(completedSteps, currentLabel);
  }
  if (runId) {
    await prisma.scoreSyncRun.update({
      where: { id: runId },
      data: { completedSteps, currentLabel },
    });
  }
}

async function upsertRoomCatalog(
  roomSlug: string,
  roomName: string,
  roomGames: { id: number; name: string; roomId: number; roomIndex: number }[],
) {
  for (const game of roomGames) {
    await prisma.activateGame.upsert({
      where: { id: game.id },
      create: {
        id: game.id,
        name: game.name,
        roomSlug,
        roomName,
        roomId: game.roomId,
        sortIndex: game.roomIndex,
      },
      update: {
        name: game.name,
        roomSlug,
        roomName,
        roomId: game.roomId,
        sortIndex: game.roomIndex,
      },
    });
  }
}

async function ensureActivateGameExists(
  gameId: number,
  roomSlug: string,
  roomName: string,
) {
  const existing = await prisma.activateGame.findUnique({ where: { id: gameId } });
  if (existing) return;

  await prisma.activateGame.create({
    data: {
      id: gameId,
      name: `Game ${gameId}`,
      roomSlug,
      roomName,
      roomId: 0,
      sortIndex: 999,
    },
  });
}

async function upsertGameCatalogFromScript(scriptText: string) {
  const rooms = parseRoomsListFromScript(scriptText);
  const roomNameById = new Map(rooms.map((room) => [room.id, room.name]));
  const allGames = parseAllGamesFromScript(scriptText);

  for (const game of allGames) {
    const roomName = roomNameById.get(game.roomId) ?? "Other";
    const roomSlug = roomNameToSlug(roomName);
    await prisma.activateGame.upsert({
      where: { id: game.id },
      create: {
        id: game.id,
        name: game.name,
        roomSlug,
        roomName,
        roomId: game.roomId,
        sortIndex: game.roomIndex,
      },
      update: {
        name: game.name,
        roomSlug,
        roomName,
        roomId: game.roomId,
        sortIndex: game.roomIndex,
      },
    });
  }
}

async function upsertGlobalTopScores(
  roomSlug: string,
  roomName: string,
  roomScores: ActivateLevelScoreEntry[],
) {
  for (const entry of roomScores) {
    await ensureActivateGameExists(entry.gameId, roomSlug, roomName);
    const level = activateLevelIdToDisplayLevel(entry.levelId);
    await prisma.globalLevelTopScore.upsert({
      where: {
        gameId_level: {
          gameId: entry.gameId,
          level,
        },
      },
      create: {
        gameId: entry.gameId,
        level,
        topScore: entry.highScore,
      },
      update: {
        topScore: entry.highScore,
      },
    });
  }
}

async function ensureGamesExistForScores(scores: ActivateLevelScoreEntry[]) {
  const gameIds = [
    ...new Set(
      scores.filter((entry) => entry.highScore > 0).map((entry) => entry.gameId),
    ),
  ];

  for (const gameId of gameIds) {
    await ensureActivateGameExists(gameId, "unknown", "Other");
  }
}

async function upsertUserLevelScores(
  userId: string,
  scores: ActivateLevelScoreEntry[],
) {
  const knownGames = await prisma.activateGame.findMany({ select: { id: true } });
  const knownGameIds = new Set(knownGames.map((game) => game.id));

  const scoreRows = scores
    .filter((entry) => entry.highScore > 0 && knownGameIds.has(entry.gameId))
    .map((entry) => ({
      userId,
      gameId: entry.gameId,
      level: activateLevelIdToDisplayLevel(entry.levelId),
      score: entry.highScore,
    }));

  const skippedCount = scores.filter(
    (entry) => entry.highScore > 0 && !knownGameIds.has(entry.gameId),
  ).length;
  if (skippedCount > 0) {
    console.warn(
      `[score-sync] Skipped ${skippedCount} level scores for user ${userId} — game not in catalog`,
    );
  }

  if (scoreRows.length === 0) {
    await prisma.userLevelScore.deleteMany({ where: { userId } });
    return;
  }

  await prisma.$transaction([
    prisma.userLevelScore.deleteMany({ where: { userId } }),
    prisma.userLevelScore.createMany({ data: scoreRows }),
  ]);
}

/**
 * Sync PlayActivate scores for all active real users with linked accounts.
 * Fetches 11 room pages (game catalog + global tops) then one page per player.
 */
export async function runScoreSync(
  runId?: string,
  callbacks?: SyncProgressCallbacks,
): Promise<ScoreSyncResult> {
  const usersToSync = await prisma.user.findMany({
    where: {
      isActive: true,
      isTestUser: false,
      activatePlayerName: { not: null },
    },
    select: {
      id: true,
      activatePlayerName: true,
    },
  });

  const roomUsername =
    usersToSync.find((user) => user.activatePlayerName)?.activatePlayerName ?? null;

  const totalSteps = ACTIVATE_ROOM_SLUGS.length + usersToSync.length;

  if (runId) {
    await prisma.scoreSyncRun.update({
      where: { id: runId },
      data: {
        status: "running",
        totalSteps,
        completedSteps: 0,
        currentLabel: "Starting sync…",
      },
    });
  }

  let synced = 0;
  let notFound = 0;
  let errors = 0;
  let completedSteps = 0;
  const errorDetails: ScoreSyncErrorDetail[] = [];

  if (!roomUsername) {
    const result = { synced: 0, notFound: 0, errors: 0 };
    if (runId) {
      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedSteps: 0,
          totalSteps: 0,
          currentLabel: "No linked players to sync",
          syncedCount: 0,
          notFoundCount: 0,
          errorCount: 0,
          completedAt: new Date(),
        },
      });
    }
    return result;
  }

  try {
    await withActivateBrowserSession(async (_browser, page) => {
      for (const roomSlug of ACTIVATE_ROOM_SLUGS) {
        const label = `Fetching ${decodeURIComponent(roomSlug)} scores…`;
        await updateRunProgress(runId, completedSteps, label, callbacks);

        try {
          const roomData = await fetchRoomPageData(page, roomUsername, roomSlug);
          const roomName = roomData.roomInfo?.name ?? decodeURIComponent(roomSlug);
          await upsertRoomCatalog(roomSlug, roomName, roomData.roomGames);
          await upsertGlobalTopScores(roomSlug, roomName, roomData.roomScores);
        } catch (roomError) {
          console.error(`[score-sync] Room fetch failed (${roomSlug}):`, roomError);
          errors++;
          errorDetails.push({
            context: `Room: ${decodeURIComponent(roomSlug)}`,
            message: formatSyncError(roomError),
          });
        }

        completedSteps++;
        await updateRunProgress(runId, completedSteps, label, callbacks);
      }

      for (const user of usersToSync) {
        const playerName = user.activatePlayerName!;
        const label = `Syncing ${playerName}…`;
        await updateRunProgress(runId, completedSteps, label, callbacks);

        try {
          const playerData = await fetchPlayerPageData(page, playerName);
          const overall = extractOverallStats(playerData.bodyText, playerData);

          if (overall.score === null) {
            notFound++;
            completedSteps++;
            await updateRunProgress(runId, completedSteps, label, callbacks);
            continue;
          }

          const rankColor = getRankColor(overall.score);
          await prisma.user.update({
            where: { id: user.id },
            data: {
              currentScore: overall.score,
              rankColor,
              lastScoreSource: "scrape",
              lastSyncedAt: new Date(),
              lastGoodScoreAt: new Date(),
              ...(overall.rank != null ? { activateRank: overall.rank } : {}),
              ...(overall.leaderboardPosition
                ? { leaderboardPosition: overall.leaderboardPosition }
                : {}),
              ...(overall.levelsBeat ? { levelsBeat: overall.levelsBeat } : {}),
              ...(overall.coins != null ? { coins: overall.coins } : {}),
            },
          });

          await upsertGameCatalogFromScript(playerData.scriptText);
          await ensureGamesExistForScores(playerData.playerLocation.scores);
          await upsertUserLevelScores(user.id, playerData.playerLocation.scores);
          synced++;
        } catch (playerError) {
          console.error(`[score-sync] Player sync failed (${playerName}):`, playerError);
          errors++;
          errorDetails.push({
            context: `Player: ${playerName}`,
            message: formatSyncError(playerError),
          });
        }

        completedSteps++;
        await updateRunProgress(runId, completedSteps, label, callbacks);
      }
    });

    if (runId) {
      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedSteps,
          currentLabel: "Sync complete",
          syncedCount: synced,
          notFoundCount: notFound,
          errorCount: errors,
          errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
          completedAt: new Date(),
        },
      });
    }
  } catch (fatalError) {
    const errorMessage =
      fatalError instanceof Error ? fatalError.message : String(fatalError);
    console.error("[score-sync] Fatal error:", fatalError);

    if (runId) {
      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          errorMessage,
          syncedCount: synced,
          notFoundCount: notFound,
          errorCount: errors + 1,
          errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
          completedAt: new Date(),
        },
      });
    }
    throw fatalError;
  }

  return { synced, notFound, errors };
}

export async function getActiveScoreSyncRun() {
  return prisma.scoreSyncRun.findFirst({
    where: { status: { in: ["pending", "running"] } },
    orderBy: { startedAt: "desc" },
  });
}

export async function getLatestFinishedScoreSyncRun() {
  return prisma.scoreSyncRun.findFirst({
    where: { status: { in: ["completed", "failed"] } },
    orderBy: { completedAt: "desc" },
  });
}

/** @deprecated Use getLatestFinishedScoreSyncRun */
export async function getLatestCompletedScoreSyncRun() {
  return getLatestFinishedScoreSyncRun();
}
