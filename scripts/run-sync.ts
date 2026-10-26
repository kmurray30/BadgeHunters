#!/usr/bin/env npx tsx
/**
 * Hourly job, run by the Railway cron service (`npm run sync:cron`):
 * expires past sessions, then syncs scores and badges from the Activate API.
 * Exits when done so Railway can schedule the next run.
 */

import { prisma } from "../src/lib/db";
import { runSessionExpiry } from "../src/lib/session-expiry";
import { getActiveScoreSyncRun, runScoreSync } from "../src/lib/score-sync";

async function main() {
  const expiry = await runSessionExpiry();
  console.log(`[cron] Expired ${expiry.expired} session(s)`);

  const activeRun = await getActiveScoreSyncRun();
  if (activeRun) {
    console.log(`[cron] Sync run ${activeRun.id} is already in progress; skipping this hour`);
    return;
  }

  // Runs need an owner; attribute scheduled ones to the first superuser so they
  // show on the sync page like manual runs.
  const owner = await prisma.user.findFirst({
    where: { role: "superuser" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  const runId = owner
    ? (
        await prisma.scoreSyncRun.create({
          data: {
            startedByUserId: owner.id,
            status: "pending",
            currentLabel: "Queued (hourly sync)…",
          },
        })
      ).id
    : undefined;
  if (!runId) {
    console.warn("[cron] No superuser found; running sync without a sync-page record");
  }

  const startedAtMs = Date.now();
  const result = await runScoreSync(runId);
  console.log(
    `[cron] Sync ${result.continued ? "handed off to the web service after one batch" : "finished"} in ${Math.round((Date.now() - startedAtMs) / 1000)}s: ${result.synced} synced, ${result.notFound} not found, ${result.errors} errors`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[cron] Hourly sync failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
