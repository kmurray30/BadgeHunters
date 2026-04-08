import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { sessionIsolationFilter, isolationFilter } from "@/lib/isolation";
import Link from "next/link";
import { SessionsListClient } from "./sessions-list-client";

export default async function SessionsPage() {
  const user = await requireUser();
  const sessionFilter = sessionIsolationFilter(user);
  const userFilter = isolationFilter(user);

  const sessions = await prisma.session.findMany({
    where: sessionFilter,
    orderBy: { sessionDateLocal: "desc" },
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

  function formatSessionDate(date: Date, format: "long" | "short"): string {
    if (format === "long") {
      return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
    }
    return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
  }

  function sessionDateStringLA(date: Date): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(date);
  }

  const todayString = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  const activeSessions = sessions.filter((session) => session.status === "active");
  const pastSessions = sessions.filter((session) => session.status !== "active");

  function toListItem(session: typeof sessions[number]) {
    return {
      id: session.id,
      title: session.title,
      dateDisplay: formatSessionDate(session.sessionDateLocal, "short"),
      dateStringLA: sessionDateStringLA(session.sessionDateLocal),
      status: session.status,
      createdByDisplayName: getDisplayName(session.createdBy),
      members: session.members.map((member) => ({
        id: member.user.id,
        displayName: getDisplayName(member.user),
        isCurrentUser: member.user.id === user.id,
      })),
      ghostMembers: session.ghostMembers.map((ghost) => ({
        id: ghost.id,
        displayName: ghost.displayName,
      })),
      selectionCount: session._count.selections,
      needsReview: session.status === "completed_pending_ack" && (session.acknowledgements[0]?.needsReview ?? false),
      isMember: session.members.some((member) => member.user.id === user.id),
    };
  }

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

      <SessionsListClient
        activeSessions={activeSessions.map(toListItem)}
        pastSessions={pastSessions.map(toListItem)}
        todayString={todayString}
      />
    </div>
  );
}
