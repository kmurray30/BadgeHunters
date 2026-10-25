import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/lib/auth";
import { runScoreSync } from "@/lib/score-sync";
import { claimSyncContinuation } from "@/lib/sync-continuation";

export const maxDuration = 300;

/**
 * Continue a multi-chunk score sync.
 * Auth: CRON_SECRET bearer token (server self-call) or a signed-in user (sync page).
 * Safe to call repeatedly: only the first caller claims the next chunk.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCronCaller = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCronCaller) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => null);
  const runId = body?.runId;

  if (typeof runId !== "string" || !runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const claimed = await claimSyncContinuation(runId);
  if (!claimed) {
    return NextResponse.json({ ok: true, runId, claimed: false });
  }

  console.info(
    `[sync/continue] Resuming run ${runId} (caller: ${isCronCaller ? "server" : "sync page"})`,
  );

  after(async () => {
    try {
      await runScoreSync(runId, undefined, { resume: true });
    } catch (syncError) {
      console.error("[sync/continue] Background sync failed:", syncError);
    }
  });

  return NextResponse.json({ ok: true, runId, claimed: true });
}
