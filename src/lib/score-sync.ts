import {
  ActivateBrowserSession,
  FETCH_DELAY_MS,
  PLAYER_STEP_TIMEOUT_MS,
  withTimeout,
} from "@/lib/activate-browser";
import { ACTIVATE_ROOM_SLUGS } from "@/lib/activate-config";
import {
  activateLevelIdToDisplayLevel,
  type ActivateLevelScoreEntry,
} from "@/lib/activate-parser";
import {
  extractOverallStats,
  fetchPlayerPageData,
  fetchRoomPageData,
} from "@/lib/activate-scraper";
import { prisma } from "@/lib/db";
import { getRankColor } from "@/lib/rank";
import {
  errorDetailsForDb,
  recordSyncError,
  type ScoreSyncErrorDetail,
} from "@/lib/score-sync-run";

export type { ScoreSyncErrorDetail } from "@/lib/score-sync-run";

export interface ScoreSyncResult {
  synced: number;
  notFound: number;
  errors: number;
}

export class SyncCancelledError extends Error {
  constructor() {
    super("Sync cancelled");
    this.name = "SyncCancelledError";
  }
}

interface SyncProgressCallbacks {
  onProgress?: (completedSteps: number, currentLabel: string) => Promise<void>;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function assertSyncNotCancelled(runId: string | undefined) {
  if (!runId) return;

  const run = await prisma.scoreSyncRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (run?.status === "cancelled") {
    throw new SyncCancelledError();
  }
}

async function updateRunProgress(
  runId: string | undefined,
  completedSteps: number,
  currentLabel: string,
  callbacks?: SyncProgressCallbacks,
) {
  await assertSyncNotCancelled(runId);

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

async function loadKnownGameIds(): Promise<Set<number>> {
  const games = await prisma.activateGame.findMany({ select: { id: true } });
  return new Set(games.map((game) => game.id));
}

async function ensureGamesExistForScores(
  scores: ActivateLevelScoreEntry[],
  knownGameIds: Set<number>,
) {
  const gameIds = [
    ...new Set(
      scores.filter((entry) => entry.highScore > 0).map((entry) => entry.gameId),
    ),
  ];

  for (const gameId of gameIds) {
    if (knownGameIds.has(gameId)) continue;
    await ensureActivateGameExists(gameId, "unknown", "Other");
    knownGameIds.add(gameId);
  }
}

async function upsertUserLevelScores(
  userId: string,
  scores: ActivateLevelScoreEntry[],
  knownGameIds: Set<number>,
) {
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
    const session = await ActivateBrowserSession.create();
    let knownGameIds = await loadKnownGameIds();
    try {
      for (const roomSlug of ACTIVATE_ROOM_SLUGS) {
        await assertSyncNotCancelled(runId);

        const label = `Fetching ${decodeURIComponent(roomSlug)} scores…`;
        await updateRunProgress(runId, completedSteps, label, callbacks);

        try {
          const roomData = await session.withPage((page) =>
            fetchRoomPageData(page, roomUsername, roomSlug),
          );
          const roomName = roomData.roomInfo?.name ?? decodeURIComponent(roomSlug);
          await upsertRoomCatalog(roomSlug, roomName, roomData.roomGames);
          await upsertGlobalTopScores(roomSlug, roomName, roomData.roomScores);
          for (const game of roomData.roomGames) {
            knownGameIds.add(game.id);
          }
        } catch (roomError) {
          console.error(`[score-sync] Room fetch failed (${roomSlug}):`, roomError);
          errors = await recordSyncError(
            runId,
            errorDetails,
            `Room: ${decodeURIComponent(roomSlug)}`,
            roomError,
          );
        }

        completedSteps++;
        await updateRunProgress(runId, completedSteps, label, callbacks);
        await delay(FETCH_DELAY_MS);
      }

      for (const user of usersToSync) {
        await assertSyncNotCancelled(runId);

        const playerName = user.activatePlayerName!;
        const fetchLabel = `Fetching ${playerName}…`;
        await updateRunProgress(runId, completedSteps, fetchLabel, callbacks);

        try {
          await withTimeout(
            (async () => {
              const playerData = await session.withPage((page) =>
                fetchPlayerPageData(page, playerName),
              );
              const overall = extractOverallStats(playerData);

              if (overall.score === null) {
                notFound++;
                return;
              }

              const saveLabel = `Saving ${playerName}…`;
              await updateRunProgress(runId, completedSteps, saveLabel, callbacks);

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

              await ensureGamesExistForScores(
                playerData.playerLocation.scores,
                knownGameIds,
              );
              await upsertUserLevelScores(
                user.id,
                playerData.playerLocation.scores,
                knownGameIds,
              );
              synced++;
            })(),
            PLAYER_STEP_TIMEOUT_MS,
            `Sync ${playerName}`,
            () => session.forceResetPage(),
          );
        } catch (playerError) {
          console.error(`[score-sync] Player sync failed (${playerName}):`, playerError);
          errors = await recordSyncError(
            runId,
            errorDetails,
            `Player: ${playerName}`,
            playerError,
          );
        }

        completedSteps++;
        await updateRunProgress(
          runId,
          completedSteps,
          `Synced ${playerName}`,
          callbacks,
        );
        await delay(FETCH_DELAY_MS);
      }
    } finally {
      await session.close();
    }

    if (runId) {
      await assertSyncNotCancelled(runId);

      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedSteps,
          currentLabel: "Sync complete",
          syncedCount: synced,
          notFoundCount: notFound,
          errorCount: errors,
          errorDetails: errorDetailsForDb(errorDetails),
          completedAt: new Date(),
        },
      });
    }
  } catch (fatalError) {
    if (fatalError instanceof SyncCancelledError) {
      return { synced, notFound, errors };
    }

    const errorMessage =
      fatalError instanceof Error ? fatalError.message : String(fatalError);
    console.error("[score-sync] Fatal error:", fatalError);

    if (runId) {
      const existingRun = await prisma.scoreSyncRun.findUnique({
        where: { id: runId },
        select: { status: true },
      });
      if (existingRun?.status === "cancelled") {
        return { synced, notFound, errors };
      }

      errors = await recordSyncError(runId, errorDetails, "Fatal", fatalError);

      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          errorMessage,
          syncedCount: synced,
          notFoundCount: notFound,
          errorCount: errors,
          errorDetails: errorDetailsForDb(errorDetails),
          completedAt: new Date(),
        },
      });
    }
    throw fatalError;
  }

  return { synced, notFound, errors };
}

export async function cancelScoreSyncRun(runId: string): Promise<boolean> {
  const result = await prisma.scoreSyncRun.updateMany({
    where: {
      id: runId,
      status: { in: ["pending", "running"] },
    },
    data: {
      status: "cancelled",
      currentLabel: "Cancelled",
      completedAt: new Date(),
    },
  });

  return result.count > 0;
}

const SYNC_STALE_THRESHOLD_MS = 4 * 60 * 1000;

async function expireStaleScoreSyncRunIfNeeded(run: {
  id: string;
  status: string;
  startedAt: Date;
}): Promise<boolean> {
  if (!["pending", "running"].includes(run.status)) {
    return false;
  }
  if (Date.now() - run.startedAt.getTime() <= SYNC_STALE_THRESHOLD_MS) {
    return false;
  }

  await prisma.scoreSyncRun.updateMany({
    where: {
      id: run.id,
      status: { in: ["pending", "running"] },
    },
    data: {
      status: "failed",
      errorMessage: "Sync timed out or was interrupted",
      currentLabel: "Timed out",
      completedAt: new Date(),
    },
  });
  return true;
}

export async function getActiveScoreSyncRun() {
  const activeRun = await prisma.scoreSyncRun.findFirst({
    where: { status: { in: ["pending", "running"] } },
    orderBy: { startedAt: "desc" },
  });

  if (!activeRun) return null;

  if (await expireStaleScoreSyncRunIfNeeded(activeRun)) {
    return null;
  }

  return activeRun;
}

export async function getLatestFinishedScoreSyncRun() {
  return prisma.scoreSyncRun.findFirst({
    where: { status: { in: ["completed", "failed", "cancelled"] } },
    orderBy: { completedAt: "desc" },
  });
}

/** @deprecated Use getLatestFinishedScoreSyncRun */
export async function getLatestCompletedScoreSyncRun() {
  return getLatestFinishedScoreSyncRun();
}

export { expireStaleScoreSyncRunIfNeeded, SYNC_STALE_THRESHOLD_MS };
