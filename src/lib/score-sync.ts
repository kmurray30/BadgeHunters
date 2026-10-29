import {
  PLAYER_STEP_TIMEOUT_MS,
  ROOM_STEP_TIMEOUT_MS,
  withTimeout,
} from "@/lib/activate-browser";
import {
  ActivateApiClient,
  buildApiUrl,
  extractOverallStats,
  playerBadgesPath,
  findRoomForSlug,
  playerLocationPath,
  type ActivateLocationCatalog,
} from "@/lib/activate-api";
import { ACTIVATE_LOCATION, ACTIVATE_ROOM_SLUGS, decodeRoomSlug, HIDDEN_GAME_IDS } from "@/lib/activate-config";
import {
  addMissingLocationBadges,
  loadBadgeCatalogIndex,
  syncPlayerBadges,
  type BadgeCatalogIndex,
} from "@/lib/badge-sync";
import {
  mapWithConcurrency,
  resolveSyncFetchConcurrency,
} from "@/lib/sync-parallel";
import {
  countCompletedSteps,
  createInitialSyncProgress,
  overallProgressLabel,
  parseSyncProgress,
  syncProgressForDb,
  type SyncProgressSnapshot,
} from "@/lib/sync-progress";
import {
  activateLevelIdToDisplayLevel,
  type ActivateLevelScoreEntry,
} from "@/lib/activate-parser";
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
  SYNC_CONTINUATION_LABEL,
  SYNC_RUN_BUDGET_MS,
} from "@/lib/sync-continuation";

export type { ScoreSyncErrorDetail, SyncProgressSnapshot } from "@/lib/score-sync-run";
export type { SyncPlayerProgressItem, SyncRoomProgressItem, SyncItemStatus } from "@/lib/sync-progress";

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

class SyncTimeBudgetExceededError extends Error {
  constructor() {
    super("Sync time budget exceeded");
    this.name = "SyncTimeBudgetExceededError";
  }
}

function syncLog(runId: string | undefined, message: string) {
  console.info(`[score-sync]${runId ? ` run=${runId}` : ""} ${message}`);
}

function describeRunningSteps(snapshot: SyncProgressSnapshot | null): string | null {
  if (!snapshot) return null;
  const running = [
    ...snapshot.rooms.filter((room) => room.status === "running").map((room) => `Room ${room.label}`),
    ...snapshot.players
      .filter((player) => player.status === "running")
      .map((player) => `Player ${player.playerName}`),
  ];
  return running.length > 0 ? running.join(", ") : null;
}

function resetRunningItemsToPending(snapshot: SyncProgressSnapshot) {
  for (const room of snapshot.rooms) {
    if (room.status === "running") room.status = "pending";
  }
  for (const player of snapshot.players) {
    if (player.status === "running") player.status = "pending";
  }
}

type SyncTask =
  | { kind: "room"; roomIndex: number }
  | { kind: "player"; playerIndex: number };

function collectPendingSyncTasks(snapshot: SyncProgressSnapshot): SyncTask[] {
  const tasks: SyncTask[] = [];

  for (let roomIndex = 0; roomIndex < snapshot.rooms.length; roomIndex += 1) {
    if (snapshot.rooms[roomIndex].status === "pending") {
      tasks.push({ kind: "room", roomIndex });
    }
  }

  for (let playerIndex = 0; playerIndex < snapshot.players.length; playerIndex += 1) {
    if (snapshot.players[playerIndex].status === "pending") {
      tasks.push({ kind: "player", playerIndex });
    }
  }

  return tasks;
}

class SyncProgressTracker {
  private snapshot: SyncProgressSnapshot;
  private persistLock = Promise.resolve();

  constructor(
    snapshot: SyncProgressSnapshot,
    private runId: string | undefined,
    private callbacks: SyncProgressCallbacks | undefined,
  ) {
    this.snapshot = snapshot;
  }

  getSnapshot(): SyncProgressSnapshot {
    return this.snapshot;
  }

  private async lockedPersist(): Promise<void> {
    await assertSyncNotCancelled(this.runId);
    const completedSteps = countCompletedSteps(this.snapshot);
    const currentLabel = overallProgressLabel(this.snapshot);

    if (this.callbacks?.onProgress) {
      await this.callbacks.onProgress(completedSteps, currentLabel);
    }
    if (this.runId) {
      await prisma.scoreSyncRun.update({
        where: { id: this.runId },
        data: {
          completedSteps,
          currentLabel,
          syncProgress: syncProgressForDb(this.snapshot),
          lastProgressAt: new Date(),
        },
      });
    }
  }

  async persist(): Promise<void> {
    const pending = this.persistLock.then(() => this.lockedPersist());
    // Keep the chain alive: one failed write must not reject every later persist.
    this.persistLock = pending.catch(() => {});
    await pending;
  }

  async setRoomStatus(
    roomIndex: number,
    status: SyncProgressSnapshot["rooms"][number]["status"],
  ): Promise<void> {
    this.snapshot.rooms[roomIndex].status = status;
    await this.persist();
  }

  async setPlayerStatus(
    playerIndex: number,
    status: SyncProgressSnapshot["players"][number]["status"],
    label?: string,
  ): Promise<void> {
    this.snapshot.players[playerIndex].status = status;
    if (label !== undefined) {
      this.snapshot.players[playerIndex].label = label;
    }
    await this.persist();
  }

  async setPhase(phase: SyncProgressSnapshot["phase"]): Promise<void> {
    this.snapshot.phase = phase;
    await this.persist();
  }

  async markComplete(): Promise<void> {
    this.snapshot.phase = "complete";
    await this.persist();
  }
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

/**
 * Games in this room's catalog that also have a location leaderboard. The
 * catalog alone also lists one-level special modes and games nobody here can
 * play; neither ever gets high scores. HIDDEN_GAME_IDS stay out regardless.
 */
export function activeRoomGameIds(
  roomGames: { id: number }[],
  roomScores: ActivateLevelScoreEntry[],
): number[] {
  const scoredIds = new Set(roomScores.filter((entry) => entry.highScore > 0).map((entry) => entry.gameId));
  return roomGames.filter((game) => scoredIds.has(game.id) && !HIDDEN_GAME_IDS.includes(game.id)).map((game) => game.id);
}

async function updateRoomGameActivity(
  roomSlug: string,
  roomGames: { id: number }[],
  roomScores: ActivateLevelScoreEntry[],
) {
  // An empty leaderboard is more likely an API hiccup than a room with no games.
  if (roomScores.length === 0) return;
  const activeIds = activeRoomGameIds(roomGames, roomScores);
  await prisma.activateGame.updateMany({ where: { id: { in: activeIds } }, data: { isActive: true } });
  await prisma.activateGame.updateMany({
    where: { roomSlug, id: { notIn: activeIds } },
    data: { isActive: false },
  });
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
 * Fetches 11 room pages (game catalog + global tops) and one page per player.
 * All pending steps run in parallel (concurrency = step count unless capped via env).
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

  const linkedUsers = usersToSync.flatMap((user) => {
    if (!user.activatePlayerName) return [];
    return [{ id: user.id, activatePlayerName: user.activatePlayerName }];
  });

  const roomUsername = linkedUsers[0]?.activatePlayerName ?? null;
  const totalSteps = ACTIVATE_ROOM_SLUGS.length + linkedUsers.length;

  let synced = 0;
  let notFound = 0;
  let errors = 0;
  const errorDetails: ScoreSyncErrorDetail[] = [];
  let errorRecordLock = Promise.resolve();

  async function recordSyncErrorLocked(
    context: string,
    error: unknown,
    options?: { url?: string },
  ) {
    const pending = errorRecordLock.then(async () => {
      errors = await recordSyncError(runId, errorDetails, context, error, options);
    });
    errorRecordLock = pending.catch(() => {});
    await pending;
  }

  let syncProgress = createInitialSyncProgress(linkedUsers);

  if (runId && resume) {
    const existingRun = await prisma.scoreSyncRun.findUnique({
      where: { id: runId },
    });

    if (!existingRun || existingRun.status !== "running") {
      return { synced: 0, notFound: 0, errors: 0 };
    }

    synced = existingRun.syncedCount ?? 0;
    notFound = existingRun.notFoundCount ?? 0;
    errors = existingRun.errorCount ?? 0;
    errorDetails.push(...parseErrorDetails(existingRun.errorDetails));
    syncProgress =
      parseSyncProgress(existingRun.syncProgress) ??
      createInitialSyncProgress(linkedUsers);
    resetRunningItemsToPending(syncProgress);
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
        syncProgress: syncProgressForDb(syncProgress),
        errorMessage: null,
        completedAt: null,
        lastProgressAt: new Date(),
      },
    });
  }

  const progressTracker = new SyncProgressTracker(syncProgress, runId, callbacks);

  async function pauseForContinuation(): Promise<ScoreSyncResult> {
    if (runId) {
      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "running",
          completedSteps: countCompletedSteps(progressTracker.getSnapshot()),
          currentLabel: SYNC_CONTINUATION_LABEL,
          syncedCount: synced,
          notFoundCount: notFound,
          errorCount: errors,
          errorDetails: errorDetailsForDb(errorDetails),
          syncProgress: syncProgressForDb(progressTracker.getSnapshot()),
          lastProgressAt: new Date(),
        },
      });
      const snapshot = progressTracker.getSnapshot();
      syncLog(
        runId,
        `Chunk paused after ${Math.round((Date.now() - runStartedAtMs) / 1000)}s: ${countCompletedSteps(snapshot)}/${totalSteps} steps done, waiting for next batch`,
      );
      const continuationError = await scheduleSyncContinuation(runId);
      if (continuationError) {
        // Not counted as a step error: the sync page can still resume the run.
        await prisma.scoreSyncRun.update({
          where: { id: runId },
          data: { errorMessage: continuationError },
        });
      }
    }

    return { synced, notFound, errors, continued: true };
  }

  function assertTimeBudgetAvailable() {
    if (isSyncTimeBudgetExceeded(runStartedAtMs)) {
      throw new SyncTimeBudgetExceededError();
    }
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
    const apiClient = new ActivateApiClient();
    const knownGameIds = await loadKnownGameIds();
    // Rooms + games for the location, fetched once per chunk and shared by room steps.
    let catalogPromise: Promise<ActivateLocationCatalog> | null = null;
    const getCatalog = () => {
      catalogPromise ??= apiClient.getLocationCatalog();
      return catalogPromise;
    };
    // Badge catalog for matching completions, topped up with any new badges the
    // API lists for our location. Built once per chunk and shared by player steps.
    let badgeCatalogPromise: Promise<BadgeCatalogIndex> | null = null;
    const getBadgeCatalog = () => {
      badgeCatalogPromise ??= (async () => {
        const catalog = await loadBadgeCatalogIndex();
        try {
          const added = await addMissingLocationBadges(apiClient, catalog);
          if (added.length === 0) return catalog;
          syncLog(runId, `Added ${added.length} new badge(s) from PlayActivate: ${added.join(", ")}`);
          return loadBadgeCatalogIndex();
        } catch (catalogError) {
          console.error(
            `[score-sync]${runId ? ` run=${runId}` : ""} Adding new badges failed:`,
            formatSyncError(catalogError),
            catalogError,
          );
          await recordSyncErrorLocked("Badge catalog", catalogError, {
            url: buildApiUrl(`/location/${ACTIVATE_LOCATION.id}/badges`),
          });
          return loadBadgeCatalogIndex();
        }
      })();
      return badgeCatalogPromise;
    };

    try {
      const pendingTasks = collectPendingSyncTasks(progressTracker.getSnapshot());
      const concurrency = resolveSyncFetchConcurrency(pendingTasks.length);
      syncLog(
        runId,
        `${resume ? "Resuming" : "Starting"} chunk: ${pendingTasks.length} pending of ${totalSteps} steps, concurrency=${concurrency}, budget=${SYNC_RUN_BUDGET_MS / 1000}s`,
      );

      if (pendingTasks.length > 0) {
        assertTimeBudgetAvailable();

        const hasPendingRooms = progressTracker
          .getSnapshot()
          .rooms.some((room) => room.status === "pending");
        await progressTracker.setPhase(hasPendingRooms ? "rooms" : "players");

        const taskResults = await mapWithConcurrency(
          pendingTasks,
          concurrency,
          async (task) => {
            assertTimeBudgetAvailable();
            await assertSyncNotCancelled(runId);

            if (task.kind === "room") {
              const roomIndex = task.roomIndex;
              const roomSlug = ACTIVATE_ROOM_SLUGS[roomIndex];
              await progressTracker.setRoomStatus(roomIndex, "running");
              const stepStartedAtMs = Date.now();
              syncLog(runId, `Room ${decodeRoomSlug(roomSlug)}: started`);

              try {
                const roomData = await withTimeout(
                  (async () => {
                    const catalog = await getCatalog();
                    const room = findRoomForSlug(catalog.rooms, roomSlug);
                    if (!room) {
                      throw new Error(
                        `Room "${decodeRoomSlug(roomSlug)}" not found at Activate location ${ACTIVATE_LOCATION.id}. API rooms: ${catalog.rooms.map((entry) => entry.name).join(", ")}`,
                      );
                    }
                    const roomScores = await apiClient.getRoomHighscores(room.id);
                    return {
                      room,
                      roomGames: catalog.games.filter((game) => game.roomId === room.id),
                      roomScores,
                    };
                  })(),
                  ROOM_STEP_TIMEOUT_MS,
                  `Room ${decodeRoomSlug(roomSlug)}`,
                );

                const roomName = roomData.room.name;
                await upsertRoomCatalog(roomSlug, roomName, roomData.roomGames);
                await upsertGlobalTopScores(roomSlug, roomName, roomData.roomScores);
                await updateRoomGameActivity(roomSlug, roomData.roomGames, roomData.roomScores);

                await progressTracker.setRoomStatus(roomIndex, "done");
                syncLog(
                  runId,
                  `Room ${decodeRoomSlug(roomSlug)}: done in ${Date.now() - stepStartedAtMs}ms`,
                );
                return {
                  kind: "room" as const,
                  gameIds: roomData.roomGames.map((game) => game.id),
                  synced: 0,
                  notFound: 0,
                };
              } catch (roomError) {
                console.error(
                  `[score-sync]${runId ? ` run=${runId}` : ""} Room ${decodeRoomSlug(roomSlug)}: failed after ${Date.now() - stepStartedAtMs}ms:`,
                  formatSyncError(roomError),
                  roomError,
                );
                await progressTracker.setRoomStatus(roomIndex, "error");
                await recordSyncErrorLocked(
                  `Room: ${decodeRoomSlug(roomSlug)}`,
                  roomError,
                  { url: buildApiUrl(`/location/${ACTIVATE_LOCATION.id}/rooms`) },
                );
                return {
                  kind: "room" as const,
                  gameIds: [],
                  synced: 0,
                  notFound: 0,
                };
              }
            }

            const playerIndex = task.playerIndex;
            const user = linkedUsers[playerIndex];
            const playerName = user.activatePlayerName;
            await progressTracker.setPlayerStatus(playerIndex, "running", "Fetching…");
            const stepStartedAtMs = Date.now();
            syncLog(runId, `Player ${playerName}: started`);

            try {
              const outcome = await withTimeout(
                (async () => {
                  const playerLocation = await apiClient.getPlayerLocation(playerName);

                  if (!playerLocation) {
                    await progressTracker.setPlayerStatus(
                      playerIndex,
                      "done",
                      "Not found",
                    );
                    return { synced: 0, notFound: 1 };
                  }

                  await progressTracker.setPlayerStatus(
                    playerIndex,
                    "running",
                    "Saving…",
                  );

                  const overall = extractOverallStats(playerLocation);
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
                    playerLocation.scores,
                    knownGameIds,
                  );
                  await upsertUserLevelScores(
                    user.id,
                    playerLocation.scores,
                    knownGameIds,
                  );

                  // Badge completion is independent of scores: a failure here is
                  // recorded but doesn't fail the player's score sync.
                  await progressTracker.setPlayerStatus(playerIndex, "running", "Badges…");
                  try {
                    const badgeOutcome = await syncPlayerBadges(
                      apiClient,
                      user.id,
                      playerName,
                      await getBadgeCatalog(),
                    );
                    if (badgeOutcome) {
                      syncLog(
                        runId,
                        `Player ${playerName}: badges matched=${badgeOutcome.matched}` +
                          (badgeOutcome.newlyCompleted.length
                            ? `, completed: ${badgeOutcome.newlyCompleted.join(", ")}`
                            : "") +
                          (badgeOutcome.uncompleted.length
                            ? `, un-completed: ${badgeOutcome.uncompleted.join(", ")}`
                            : "") +
                          (badgeOutcome.unmatchedApiNames.length
                            ? `, not in our catalog: ${badgeOutcome.unmatchedApiNames.join(", ")}`
                            : ""),
                      );
                    }
                  } catch (badgeError) {
                    console.error(
                      `[score-sync]${runId ? ` run=${runId}` : ""} Player ${playerName}: badge sync failed:`,
                      formatSyncError(badgeError),
                      badgeError,
                    );
                    await recordSyncErrorLocked(`Badges: ${playerName}`, badgeError, {
                      url: buildApiUrl(playerBadgesPath(playerName)),
                    });
                  }

                  await progressTracker.setPlayerStatus(playerIndex, "done", "Synced");
                  return { synced: 1, notFound: 0 };
                })(),
                PLAYER_STEP_TIMEOUT_MS,
                `Sync ${playerName}`,
              );
              syncLog(
                runId,
                `Player ${playerName}: ${outcome.synced ? "synced" : "not found"} in ${Date.now() - stepStartedAtMs}ms`,
              );
              return { kind: "player" as const, gameIds: [], ...outcome };
            } catch (playerError) {
              console.error(
                `[score-sync]${runId ? ` run=${runId}` : ""} Player ${playerName}: failed after ${Date.now() - stepStartedAtMs}ms:`,
                formatSyncError(playerError),
                playerError,
              );
              await progressTracker.setPlayerStatus(playerIndex, "error", "Failed");
              await recordSyncErrorLocked(
                `Player: ${playerName}`,
                playerError,
                { url: buildApiUrl(playerLocationPath(playerName)) },
              );
              return { kind: "player" as const, gameIds: [], synced: 0, notFound: 0 };
            }
          },
        );

        for (const result of taskResults) {
          if (result.status === "rejected") {
            const reason = result.reason;
            if (
              !(reason instanceof SyncTimeBudgetExceededError) &&
              !(reason instanceof SyncCancelledError)
            ) {
              console.error(
                `[score-sync]${runId ? ` run=${runId}` : ""} Step crashed:`,
                formatSyncError(reason),
                reason,
              );
            }
          }
          if (result.status === "fulfilled") {
            synced += result.value.synced;
            notFound += result.value.notFound;
            for (const gameId of result.value.gameIds) {
              knownGameIds.add(gameId);
            }
          }
        }
        errors = errorDetails.length;
      }

      const hasPendingWork =
        progressTracker.getSnapshot().rooms.some((room) => room.status === "pending") ||
        progressTracker.getSnapshot().players.some((player) => player.status === "pending");

      if (hasPendingWork) {
        return pauseForContinuation();
      }

      await progressTracker.markComplete();
    } finally {
      try {
        await apiClient.close();
      } catch (closeError) {
        console.error(
          "[score-sync] API client shutdown failed:",
          formatSyncError(closeError),
          closeError,
        );
      }
    }

    syncLog(
      runId,
      `Sync complete in ${Math.round((Date.now() - runStartedAtMs) / 1000)}s: ${synced} synced, ${notFound} not found, ${errors} errors`,
    );

    if (runId) {
      await assertSyncNotCancelled(runId);

      await prisma.scoreSyncRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          completedSteps: countCompletedSteps(progressTracker.getSnapshot()),
          currentLabel: "Sync complete",
          syncedCount: synced,
          notFoundCount: notFound,
          errorCount: errors,
          errorDetails: errorDetailsForDb(errorDetails),
          syncProgress: syncProgressForDb(progressTracker.getSnapshot()),
          completedAt: new Date(),
        },
      });
    }
  } catch (fatalError) {
    if (fatalError instanceof SyncCancelledError) {
      return { synced, notFound, errors };
    }

    if (fatalError instanceof SyncTimeBudgetExceededError) {
      return pauseForContinuation();
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
          syncProgress: syncProgressForDb(progressTracker.getSnapshot()),
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

// Runs can span several continuation chunks; hung runs are caught by the progress-stall check.
const SYNC_STALE_THRESHOLD_MS = 15 * 60 * 1000;
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
  errorMessage?: string | null;
  errorDetails: unknown;
  syncProgress?: unknown;
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

  const isWaitingForContinuation = run.currentLabel === SYNC_CONTINUATION_LABEL;
  const runningSteps = describeRunningSteps(parseSyncProgress(run.syncProgress));
  const stalledDetail = isWaitingForContinuation
    ? `The batch finished but the next batch never started (${progressLabel}).${run.errorMessage ? ` ${run.errorMessage}` : " Keep the sync page open so it can resume the run."}`
    : runningSteps
      ? `Steps still running when it stalled: ${runningSteps}. The server function was likely killed (Vercel maxDuration or crash) — check the Vercel function logs for [score-sync] run=${run.id}.`
      : `No steps were running — the server function likely ended between steps. Check the Vercel function logs for [score-sync] run=${run.id}.`;

  const staleMessage = isPendingStuck
    ? `Sync never started after ${Math.round(runAgeMs / 1000)}s (stuck in pending). Try again.`
    : isProgressStalled
      ? `Sync stalled on "${lastStepLabel}" with no progress for ${progressAgeMinutes}m (${progressLabel}). ${stalledDetail}`
      : `Sync exceeded time limit after ${runAgeMinutes}m (${progressLabel}). Last step: ${lastStepLabel}. Individual step errors are listed below.`;
  console.error(`[score-sync] run=${run.id} marked failed: ${staleMessage}`);

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
