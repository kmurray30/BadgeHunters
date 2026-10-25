import { prisma } from "@/lib/db";

/**
 * Wall-clock budget per serverless invocation before scheduling the next chunk.
 * New steps only start inside this budget, and a step can run up to 75s, so it
 * must stay well under the 300s maxDuration or the function is killed mid-step.
 */
export const SYNC_RUN_BUDGET_MS = Number(process.env.SYNC_RUN_BUDGET_SECONDS ?? 200) * 1000;

/** currentLabel of a run that finished a chunk and is waiting for the next one. */
export const SYNC_CONTINUATION_LABEL = "Continuing in next batch…";

export function isSyncTimeBudgetExceeded(startedAtMs: number): boolean {
  return Date.now() - startedAtMs >= SYNC_RUN_BUDGET_MS;
}

/**
 * Atomically take ownership of a run waiting for its next chunk. Both the sync
 * page and the server self-call request continuation, so only the first wins.
 */
export async function claimSyncContinuation(runId: string): Promise<boolean> {
  const result = await prisma.scoreSyncRun.updateMany({
    where: {
      id: runId,
      status: "running",
      currentLabel: SYNC_CONTINUATION_LABEL,
    },
    data: {
      currentLabel: "Resuming next batch…",
      errorMessage: null,
      lastProgressAt: new Date(),
    },
  });
  return result.count > 0;
}

function continuationBaseUrl(): string | null {
  // Prefer stable URLs: per-deployment VERCEL_URL is usually behind Deployment Protection.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.AUTH_URL) return process.env.AUTH_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

/**
 * Best-effort server-side kick for the next chunk. The sync page also requests
 * continuation while it is open, so failure here is logged, not fatal.
 * Returns an error message when the kick failed.
 */
export async function scheduleSyncContinuation(runId: string): Promise<string | null> {
  const cronSecret = process.env.CRON_SECRET;
  const baseUrl = continuationBaseUrl();

  if (!cronSecret || !baseUrl) {
    const message = `Server continuation skipped (${!cronSecret ? "CRON_SECRET" : "base URL"} not set); waiting for the sync page to resume run ${runId}`;
    console.warn(`[score-sync] ${message}`);
    return message;
  }

  const continueUrl = `${baseUrl}/api/sync/continue`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cronSecret}`,
    "Content-Type": "application/json",
  };
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  try {
    const response = await fetch(continueUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ runId }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const message = `Continuation request to ${continueUrl} failed (${response.status}): ${body.slice(0, 300)}`;
      console.error(`[score-sync] ${message}`);
      return message;
    }
    console.info(`[score-sync] Continuation requested for run ${runId} via ${continueUrl}`);
    return null;
  } catch (error) {
    const message = `Continuation request to ${continueUrl} threw: ${error instanceof Error ? error.message : String(error)}`;
    console.error(`[score-sync] ${message}`, error);
    return message;
  }
}
