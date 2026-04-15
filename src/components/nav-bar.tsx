import Link from "next/link";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { NavUserMenu } from "./nav-user-menu";
import { NotificationCenter, type NotificationItem } from "./notification-center";
import { SITE_NAME } from "@/lib/config";

export async function NavBar() {
  const session = await auth();
  const cookieStore = await cookies();
  const isAdminMode = cookieStore.get("admin_mode")?.value === "active";

  let notifications: NotificationItem[] = [];
  let activeSessionCount = 0;

  if (session?.user?.id) {
    const userId = session.user.id;

    // Fetch notifications with session status + user's ack for staleness filtering
    const rawNotifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        session: {
          select: {
            sessionDateLocal: true,
            status: true,
            expiresAt: true,
            acknowledgements: {
              where: { userId },
              select: { needsReview: true },
            },
          },
        },
      },
    });

    // Filter out stale notifications:
    // - session_review: only relevant if the session is still in review for THIS user
    //   (session is completed_pending_ack or active+past-date, AND user still needsReview)
    // - session_added: only relevant if the session isn't closed for THIS user
    //   (session status != closed, AND user still needsReview or session is active)
    const relevantNotifications = rawNotifications.filter((notification) => {
      const notifSession = notification.session;
      if (!notifSession) return true;

      const userAck = notifSession.acknowledgements[0];
      const userNeedsReview = userAck?.needsReview ?? true;
      const isPastDate = Date.now() > new Date(notifSession.expiresAt).getTime();

      if (notification.type === "session_review") {
        // Stale if: session is closed, session reverted to active (non-past-date),
        // or user already completed their review
        if (notifSession.status === "closed") return false;
        if (!userNeedsReview) return false;
        // Session is active and not past date = no longer in review
        if (notifSession.status === "active" && !isPastDate) return false;
        return true;
      }

      if (notification.type === "session_added") {
        // Stale once session is closed for this user (status=closed, or user is done)
        if (notifSession.status === "closed") return false;
        if (!userNeedsReview && notifSession.status === "completed_pending_ack") return false;
        return true;
      }

      return true;
    });

    // Purge stale notifications from the DB so they don't accumulate
    const relevantIds = new Set(relevantNotifications.map((notification) => notification.id));
    const staleIds = rawNotifications
      .filter((notification) => !relevantIds.has(notification.id))
      .map((notification) => notification.id);
    if (staleIds.length > 0) {
      prisma.notification.deleteMany({ where: { id: { in: staleIds } } }).catch(() => {});
    }

    notifications = relevantNotifications.map((notification) => ({
      id: notification.id,
      type: notification.type as NotificationItem["type"],
      sessionId: notification.sessionId,
      sessionDate: notification.session?.sessionDateLocal?.toISOString() ?? null,
      readAt: notification.readAt?.toISOString() ?? null,
      dismissedAt: notification.dismissedAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    }));

    // Count active/future/pending-review sessions for the nav badge
    const mySessions = await prisma.session.findMany({
      where: {
        status: { not: "closed" },
        members: { some: { userId } },
      },
      select: {
        status: true,
        expiresAt: true,
        sessionDateLocal: true,
        acknowledgements: {
          where: { userId },
          select: { needsReview: true },
        },
      },
    });

    const todayLA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());

    activeSessionCount = mySessions.filter((sessionItem) => {
      const dateLA = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(sessionItem.sessionDateLocal);
      const isFuture = dateLA > todayLA;
      const isPastDate = Date.now() > new Date(sessionItem.expiresAt).getTime();
      const userAck = sessionItem.acknowledgements[0];
      const myReviewDone = userAck ? !userAck.needsReview : false;

      const effectivelyInReview =
        sessionItem.status === "completed_pending_ack" ||
        (sessionItem.status === "active" && isPastDate && !isFuture);

      // Exclude sessions where the user has finished their review
      if (effectivelyInReview && myReviewDone) return false;

      return true;
    }).length;
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-foreground hover:text-accent transition-colors"
          >
            {SITE_NAME}
          </Link>
          {session?.user && (
            <>
              <Link
                href="/badges"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                My Badges
              </Link>
              <div className="relative inline-flex">
                <Link
                  href="/sessions"
                  className="text-sm text-muted hover:text-foreground transition-colors"
                >
                  Sessions
                </Link>
                {activeSessionCount > 0 && (
                  <span
                    className="pointer-events-none flex items-center justify-center"
                    style={{
                      position: "absolute", top: -8, right: -18,
                      height: 18, minWidth: 18, paddingInline: 4,
                      borderRadius: 9999, backgroundColor: "var(--warning)",
                      fontSize: 10, fontWeight: 700, color: "#000",
                      lineHeight: 1,
                    }}
                  >
                    {activeSessionCount > 9 ? "9+" : activeSessionCount}
                  </span>
                )}
              </div>
              <Link
                href="/players"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Players
              </Link>
              <Link
                href="/feedback"
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Feedback
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {isAdminMode && (
            <>
              <Link
                href="/admin"
                className="rounded-full bg-warning/20 px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/30 transition-colors"
              >
                Admin Tools
              </Link>
            </>
          )}
          {session?.user ? (
            <>
              <NotificationCenter notifications={notifications} />
              <NavUserMenu
                userId={session.user.id}
                userName={session.user.name ?? "User"}
                userImage={session.user.image ?? undefined}
                isTestUser={session.user.isTestUser}
                role={session.user.role}
              />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
