import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { sessionIsolationFilter, isolationFilter } from "@/lib/isolation";
import Link from "next/link";

export default async function SessionsPage() {
  const user = await requireUser();
  const sessionFilter = sessionIsolationFilter(user);
  const userFilter = isolationFilter(user);

  const sessions = await prisma.session.findMany({
    where: sessionFilter,
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: {
          id: true,
          activatePlayerName: true,
          realName: true,
          displayNameMode: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              activatePlayerName: true,
              realName: true,
              displayNameMode: true,
            },
          },
        },
      },
      ghostMembers: true,
      acknowledgements: {
        where: { userId: user.id },
        select: { needsReview: true },
      },
      _count: {
        select: { selections: true },
      },
    },
  });

  // Get all users in the same world for the create form
  const availableUsers = await prisma.user.findMany({
    where: { ...userFilter, isActive: true },
    select: {
      id: true,
      activatePlayerName: true,
      realName: true,
      displayNameMode: true,
    },
    orderBy: { activatePlayerName: "asc" },
  });

  function getDisplayName(appUser: { displayNameMode: string; realName: string | null; activatePlayerName: string | null }) {
    return appUser.displayNameMode === "real_name"
      ? appUser.realName ?? appUser.activatePlayerName ?? "Unknown"
      : appUser.activatePlayerName ?? appUser.realName ?? "Unknown";
  }

  const activeSessions = sessions.filter((session) => session.status === "active");
  const pastSessions = sessions.filter((session) => session.status !== "active");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Sessions</h1>
        <Link
          href="/sessions/new"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          New Session
        </Link>
      </div>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Active Sessions</h2>
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block rounded-xl border border-accent/30 bg-card p-4 hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {session.title ?? new Date(session.sessionDateLocal).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                      {" "}
                      <span className="text-xs font-normal text-muted">
                        {session.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Created by {getDisplayName(session.createdBy)}
                    </p>
                    {session.members.some((member) => member.user.id === user.id) && (
                      <p className="mt-0.5 text-[11px] font-medium text-success">You are in this session</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-success/20 px-3 py-1 text-xs font-medium text-success">
                      Active
                    </span>
                    <p className="mt-1 text-xs text-muted">
                      {session.members.length} hunters + {session.ghostMembers.length} others
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {session.members.map((member) => (
                    <span
                      key={member.id}
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        member.user.id === user.id ? "bg-accent/20 text-accent" : "bg-border text-muted"
                      }`}
                    >
                      {getDisplayName(member.user)}
                    </span>
                  ))}
                  {session.ghostMembers.map((ghost) => (
                    <span key={ghost.id} className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
                      {ghost.displayName}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Past sessions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Session History</h2>
        {pastSessions.length === 0 && activeSessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted">No sessions yet.</p>
            <p className="mt-1 text-sm text-muted">Create one to start planning your badge runs!</p>
          </div>
        ) : pastSessions.length === 0 ? (
          <p className="text-sm text-muted">No past sessions yet.</p>
        ) : (
          <div className="space-y-2">
            {pastSessions.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block rounded-xl border border-border bg-card p-4 hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {session.title ?? new Date(session.sessionDateLocal).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                      {" "}
                      <span className="text-xs font-normal text-muted">
                        {session.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </p>
                    <p className="text-xs text-muted">
                      {session.members.length} players &middot; {session._count.selections} badges selected
                    </p>
                    {session.members.some((member) => member.user.id === user.id) && (
                      <p className="mt-0.5 text-[11px] font-medium text-success">You are in this session</p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    session.status === "completed_pending_ack" && session.acknowledgements[0]?.needsReview
                      ? "bg-warning/20 text-warning"
                      : "bg-border text-muted"
                  }`}>
                    {session.status === "completed_pending_ack" && session.acknowledgements[0]?.needsReview ? "Pending Review" : "Closed"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
