import { prisma } from "@/lib/db";
import { lookupActivatePlayer } from "@/lib/activate-lookup";
import { getRankColor } from "@/lib/rank";

export interface ScoreSyncResult {
  synced: number;
  notFound: number;
  errors: number;
}

/**
 * Syncs PlayActivate scores for all active, non-test users who have an
 * activatePlayerName set. Calls the Puppeteer-based lookup for each user
 * in sequence (serial, not parallel — Puppeteer isn't safe to run
 * concurrently in the same process).
 *
 * This should run once daily via the Vercel cron job at /api/cron/daily.
 * It can also be triggered manually from the admin panel at
 * /api/cron/score-sync.
 */
export async function runScoreSync(): Promise<ScoreSyncResult> {
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

  let synced = 0;
  let notFound = 0;
  let errors = 0;

  for (const user of usersToSync) {
    // activatePlayerName is guaranteed non-null by the query filter above
    const playerName = user.activatePlayerName!;

    try {
      const result = await lookupActivatePlayer(playerName);

      if (!result.found || result.score === null) {
        notFound++;
        continue;
      }

      const rankColor = getRankColor(result.score);
      const updateData: Record<string, unknown> = {
        currentScore: result.score,
        rankColor,
        lastScoreSource: "scrape",
        lastSyncedAt: new Date(),
        lastGoodScoreAt: new Date(),
      };
      if (result.rank !== null) updateData.activateRank = result.rank;
      if (result.leaderboardPosition) updateData.leaderboardPosition = result.leaderboardPosition;
      if (result.levelsBeat) updateData.levelsBeat = result.levelsBeat;
      if (result.coins !== null) updateData.coins = result.coins;

      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });

      synced++;
    } catch (err) {
      // Log but don't abort the whole sync for a single user failure
      console.error(`[score-sync] Failed to sync user ${user.id} (${playerName}):`, err);
      errors++;
    }
  }

  return { synced, notFound, errors };
}
