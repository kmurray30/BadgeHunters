import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { runSessionExpiry } from "@/lib/session-expiry";

/** 300s max so it doesn't time out during slow DB operations on Pro plan */
export const maxDuration = 30;

/**
 * POST /api/cron/session-expiry
 *
 * Transitions all active sessions that are past their expiresAt to
 * `completed_pending_ack`. Auth: Vercel Cron secret header or admin cookie.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSessionExpiry();

  return NextResponse.json({
    success: true,
    message: `Expired ${result.expired} session(s)`,
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
