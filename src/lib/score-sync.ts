import {
  ActivateBrowserSession,
  FETCH_DELAY_MS,
  PLAYER_STEP_TIMEOUT_MS,
  ROOM_STEP_TIMEOUT_MS,
  withTimeout,
} from "@/lib/activate-browser";
import { ACTIVATE_ROOM_SLUGS, buildPlayerScoresUrl, buildRoomScoresUrl } from "@/lib/activate-config";
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
import { Prisma } from "@prisma/client";
import { getRankColor } from "@/lib/rank";
import {
  errorDetailsForDb,
  formatSyncError,
  parseErrorDetails,
  recordSyncError,
  type ScoreSyncErrorDetail,
} from "@/lib/score-sync-run";

import {
  isSyncTimeBudgetExceeded,
  scheduleSyncContinuation,
  SYNC_RUN_BUDGET_MS,
} from "@/lib/sync-continuation";

export type { ScoreSyncErrorDetail } from "@/lib/score-sync-run";

export interface ScoreSyncResult {
  synced: number;
  notFound: number;
  errors: number;
  continued?: boolean;
}

interface RunScoreSyncOptions {
  resume?: boolean;
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
      data: { completedSteps, currentLabel, lastProgressAt: new Date() },
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
 * Automatically continues in additional serverless invocations when needed.
 */
export async function runScoreSync(
  runId?: string,
  callbacks?: SyncProgressCallbacks,
  options?: RunScoreSyncOptions,
): Promise<ScoreSyncResult> {
  const resume = options?.resume === true;
  const runStartedAtMs = Date.now();

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

  let synced = 0;
  let notFound = 0;
  let errors = 0;
  let completedSteps = 0;
  const errorDetails: ScoreSyncErrorDetail[] = [];

  if (runId && resume) {
    const existingRun = await prisma.scoreSyncRun.findUnique({
      where: { id: runId },
    });

    if (!existingRun || existingRun.status !== "running") {
      return { synced: 0, notFound: 0, errors: 0 };
    }

    completedSteps = existingRun.completedSteps;
    synced = existingRun.syncedCount ?? 0;
    notFound = existingRun.notFoundCount ?? 0;
    errors = existingRun.errorCount ?? 0;
    errorDetails.push(...parseErrorDetails(existingRun.errorDetails));

    await updateRunProgress(runId, completedSteps, "Resuming sync…", callbacks);
  } else if (runId) {
    await prisma.scoreSyncRun.update({
      where: { id: runId },
      data: {
        status: "running",
        totalSteps,
        completedSteps: 0,
        currentLabel: "Starting sync…",
        syncedCount: 0,
        notFoundCount: 0,
        errorCount: 0,
        errorDetails: Prisma.DbNull,
        errorMessage: null,
        completedAt: null,
        lastProgressAt: new Date(),
      },
    });
  }

  async function pauseForContinuation(currentLabel: string): Promise<ScoreSyncResult> {
    if (runId) {
      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "running",
          completedSteps,
          currentLabel,
          syncedCount: synced,
          notFoundCount: notFound,
          errorCount: errors,
          errorDetails: errorDetailsForDb(errorDetails),
          lastProgressAt: new Date(),
        },
      });
      await scheduleSyncContinuation(runId);
    }

    return { synced, notFound, errors, continued: true };
  }

  async function ensureTimeBudget(): Promise<ScoreSyncResult | null> {
    if (!isSyncTimeBudgetExceeded(runStartedAtMs)) {
      return null;
    }
    return pauseForContinuation("Continuing in next batch…");
  }

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
      for (let roomIndex = 0; roomIndex < ACTIVATE_ROOM_SLUGS.length; roomIndex++) {
        const roomSlug = ACTIVATE_ROOM_SLUGS[roomIndex];
        if (roomIndex < completedSteps) {
          continue;
        }

        const budgetPause = await ensureTimeBudget();
        if (budgetPause) return budgetPause;

        await assertSyncNotCancelled(runId);

        const label = `Fetching ${decodeURIComponent(roomSlug)} scores…`;
        await updateRunProgress(runId, completedSteps, label, callbacks);

        try {
          await withTimeout(
            (async () => {
              const roomData = await session.withPage((page) =>
                fetchRoomPageData(page, roomUsername, roomSlug),
              );
              const roomName = roomData.roomInfo?.name ?? decodeURIComponent(roomSlug);
              await upsertRoomCatalog(roomSlug, roomName, roomData.roomGames);
              await upsertGlobalTopScores(roomSlug, roomName, roomData.roomScores);
              for (const game of roomData.roomGames) {
                knownGameIds.add(game.id);
              }
            })(),
            ROOM_STEP_TIMEOUT_MS,
            `Room ${decodeURIComponent(roomSlug)}`,
            () => session.forceKill(),
          );
        } catch (roomError) {
          console.error(`[score-sync] Room fetch failed (${roomSlug}):`, roomError);
          errors = await recordSyncError(
            runId,
            errorDetails,
            `Room: ${decodeURIComponent(roomSlug)}`,
            roomError,
            { url: buildRoomScoresUrl(roomUsername, roomSlug) },
          );
        }

        completedSteps++;
        await updateRunProgress(runId, completedSteps, label, callbacks);
        await delay(FETCH_DELAY_MS);
      }

      for (let playerIndex = 0; playerIndex < usersToSync.length; playerIndex++) {
        const user = usersToSync[playerIndex];
        const globalStepIndex = ACTIVATE_ROOM_SLUGS.length + playerIndex;
        if (globalStepIndex < completedSteps) {
          continue;
        }

        const playerName = user.activatePlayerName!;
        const fetchLabel = `Fetching ${playerName}…`;

        const budgetPause = await ensureTimeBudget();
        if (budgetPause) return budgetPause;

        await assertSyncNotCancelled(runId);
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
            () => session.forceKill(),
          );
        } catch (playerError) {
          console.error(`[score-sync] Player sync failed (${playerName}):`, playerError);
          errors = await recordSyncError(
            runId,
            errorDetails,
            `Player: ${playerName}`,
            playerError,
            { url: buildPlayerScoresUrl(playerName) },
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
      try {
        await session.close();
      } catch (closeError) {
        console.error(
          "[score-sync] Browser shutdown failed:",
          formatSyncError(closeError),
          closeError,
        );
      }
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

    const errorMessage = formatSyncError(fatalError);
    console.error("[score-sync] Fatal error:", errorMessage, fatalError);

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
const SYNC_PROGRESS_STALL_THRESHOLD_MS = 90 * 1000;
const SYNC_PENDING_STALE_THRESHOLD_MS = 45 * 1000;

async function expireStaleScoreSyncRunIfNeeded(run: {
  id: string;
  status: string;
  startedAt: Date;
  lastProgressAt: Date;
  totalSteps: number;
  completedSteps: number;
  currentLabel: string | null;
  errorDetails: unknown;
}): Promise<boolean> {
  if (!["pending", "running"].includes(run.status)) {
    return false;
  }

  const runAgeMs = Date.now() - run.startedAt.getTime();
  const progressAgeMs = Date.now() - run.lastProgressAt.getTime();
  const isPendingStuck =
    run.status === "pending" &&
    run.totalSteps === 0 &&
    runAgeMs > SYNC_PENDING_STALE_THRESHOLD_MS;
  const isProgressStalled =
    run.status === "running" && progressAgeMs > SYNC_PROGRESS_STALL_THRESHOLD_MS;
  const isRunningStale = runAgeMs > SYNC_STALE_THRESHOLD_MS;

  if (!isPendingStuck && !isProgressStalled && !isRunningStale) {
    return false;
  }

  const runAgeMinutes = Math.round(runAgeMs / 60_000);
  const progressAgeMinutes = Math.round(progressAgeMs / 60_000);
  const progressLabel =
    run.totalSteps > 0
      ? `${run.completedSteps}/${run.totalSteps} steps`
      : "no steps recorded";
  const lastStepLabel = run.currentLabel ?? "unknown";

  const staleMessage = isPendingStuck
    ? `Sync never started after ${Math.round(runAgeMs / 1000)}s (stuck in pending). Try again.`
    : isProgressStalled
      ? `Sync stalled on "${lastStepLabel}" with no progress for ${progressAgeMinutes}m (${progressLabel}). The server may have been interrupted — try again or cancel and restart.`
      : `Sync exceeded time limit after ${runAgeMinutes}m (${progressLabel}). Last step: ${lastStepLabel}. Individual step errors are listed below.`;

  const existingDetails = parseErrorDetails(run.errorDetails);
  existingDetails.push({
    context: isPendingStuck
      ? "Stale run (never started)"
      : isProgressStalled
        ? "Stale run (stalled)"
        : "Stale run (timed out)",
    message: staleMessage,
    at: new Date().toISOString(),
  });

  await prisma.scoreSyncRun.updateMany({
    where: {
      id: run.id,
      status: { in: ["pending", "running"] },
    },
    data: {
      status: "failed",
      errorMessage: staleMessage,
      currentLabel: isPendingStuck ? "Failed to start" : "Timed out",
      errorDetails: errorDetailsForDb(existingDetails),
      errorCount: existingDetails.length,
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

export { expireStaleScoreSyncRunIfNeeded, SYNC_STALE_THRESHOLD_MS, SYNC_PENDING_STALE_THRESHOLD_MS, SYNC_PROGRESS_STALL_THRESHOLD_MS };
