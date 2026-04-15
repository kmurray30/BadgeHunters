import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runSessionExpiry } from "@/lib/session-expiry";
import { runScoreSync } from "@/lib/score-sync";

/**
 * session-expiry: ~1s
 * score-sync: ~3s/user × up to ~30 users = ~90s
 * Total with margin: 150s
 */
export const maxDuration = 150;

/**
 * POST /api/cron/daily
 *
 * Runs both the session-expiry and score-sync jobs in sequence.
 * This is the endpoint targeted by the Vercel cron schedule (0 14 * * *
 * UTC = 6am LA), but each sub-job can also be triggered individually
 * from the admin panel.
 *
 * Auth: Vercel Cron secret header or admin cookie.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiryResult = await runSessionExpiry();
  const syncResult = await runScoreSync();

  return NextResponse.json({
    success: true,
    sessionExpiry: {
      message: `Expired ${expiryResult.expired} session(s)`,
      ...expiryResult,
    },
    scoreSync: {
      message: `${syncResult.synced} synced, ${syncResult.notFound} not found, ${syncResult.errors} errors`,
      ...syncResult,
    },
  });
}

/**
 * Allows invocation from two callers:
 * 1. Vercel Cron — sends `Authorization: Bearer <CRON_SECRET>` automatically
 * 2. Admin UI manual trigger — uses the admin_mode session cookie
 */
async function isCronAuthorized(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  const cookieStore = await cookies();
  return cookieStore.get("admin_mode")?.value === "active";
}
