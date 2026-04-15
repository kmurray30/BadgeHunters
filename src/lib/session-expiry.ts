import { prisma } from "@/lib/db";

export interface SessionExpiryResult {
  expired: number;
}

/**
 * Transitions all sessions that have passed their expiresAt cutoff from
 * `active` to `completed_pending_ack`.
 *
 * This should run once daily, shortly after the 6am LA cutoff, via the
 * Vercel cron job at /api/cron/daily. It can also be triggered manually
 * from the admin panel at /api/cron/session-expiry.
 *
 * After this runs, the UI's `effectivelyInReview` fallback (active + past
 * expiresAt) becomes a safety net only — the DB status is the source of truth.
 */
export async function runSessionExpiry(): Promise<SessionExpiryResult> {
  const result = await prisma.session.updateMany({
    where: {
      status: "active",
      expiresAt: { lt: new Date() },
    },
    data: { status: "completed_pending_ack" },
  });

  return { expired: result.count };
}
