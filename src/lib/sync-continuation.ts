/** Wall-clock budget per serverless invocation before scheduling the next chunk. */
export const SYNC_RUN_BUDGET_MS = Number(process.env.SYNC_RUN_BUDGET_SECONDS ?? 275) * 1000;

export function isSyncTimeBudgetExceeded(startedAtMs: number): boolean {
  return Date.now() - startedAtMs >= SYNC_RUN_BUDGET_MS;
}

export async function scheduleSyncContinuation(runId: string): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXTAUTH_URL;

  if (cronSecret && baseUrl) {
    void fetch(`${baseUrl}/api/sync/continue`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ runId }),
    }).catch((error) => {
      console.error("[score-sync] Continuation fetch failed:", error);
    });
    return;
  }

  const { after } = await import("next/server");
  const { runScoreSync } = await import("@/lib/score-sync");

  after(async () => {
    try {
      await runScoreSync(runId, undefined, { resume: true });
    } catch (continuationError) {
      console.error("[score-sync] Local continuation failed:", continuationError);
    }
  });
}
