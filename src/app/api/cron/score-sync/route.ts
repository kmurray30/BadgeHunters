import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runScoreSync } from "@/lib/score-sync";

/**
 * Puppeteer takes ~2-3s per user. With up to ~30 users this comfortably
 * fits in 120s. Bump to 300 on Vercel Pro if the group grows significantly.
 */
export const maxDuration = 120;

/**
 * POST /api/cron/score-sync
 *
 * Scrapes PlayActivate scores for all active users and persists the results.
 * Auth: Vercel Cron secret header or admin cookie.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runScoreSync();

  return NextResponse.json({
    success: true,
    message: `Score sync complete: ${result.synced} synced, ${result.notFound} not found, ${result.errors} errors`,
    ...result,
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
