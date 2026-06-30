import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { runScoreSync } from "@/lib/score-sync";

export const maxDuration = 300;

/**
 * Internal endpoint to continue a multi-chunk score sync.
 * Auth: CRON_SECRET bearer token (same as cron routes).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const runId = body?.runId;

  if (typeof runId !== "string" || !runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  after(async () => {
    try {
      await runScoreSync(runId, undefined, { resume: true });
    } catch (syncError) {
      console.error("[sync/continue] Background sync failed:", syncError);
    }
  });

  return NextResponse.json({ ok: true, runId });
}
