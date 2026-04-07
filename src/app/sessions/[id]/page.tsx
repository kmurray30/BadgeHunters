import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { notFound } from "next/navigation";
import { SessionDetailClient } from "./session-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser();
  const isolation = isolationFilter(user);

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, activatePlayerName: true, realName: true, displayNameMode: true },
      },
      completedBy: {
        select: { id: true, activatePlayerName: true, realName: true, displayNameMode: true },
      },
      members: {
        include: {
          user: {
            select: {
              id: true,
              activatePlayerName: true,
              realName: true,
              displayNameMode: true,
              rankColor: true,
              currentScore: true,
            },
          },
        },
      },
      ghostMembers: true,
      selections: {
        include: {
          badge: true,
          selectedBy: {
            select: { id: true, activatePlayerName: true, realName: true, displayNameMode: true },
          },
        },
      },
      acknowledgements: {
        where: { userId: user.id },
      },
    },
  });

  if (!session) notFound();

  // Get all badges with completion status for session members
  const memberIds = session.members.map((member) => member.user.id);

  const allBadges = await prisma.badge.findMany({
    where: { active: true },
    orderBy: { badgeNumber: "asc" },
    include: {
      userStatuses: {
        where: {
          userId: { in: memberIds },
          user: isolation,
        },
        select: {
          userId: true,
          isCompleted: true,
          personalDifficulty: true,
        },
      },
    },
  });

  function getDisplayName(appUser: { displayNameMode: string; realName: string | null; activatePlayerName: string | null }) {
    return appUser.displayNameMode === "real_name"
      ? appUser.realName ?? appUser.activatePlayerName ?? "Unknown"
      : appUser.activatePlayerName ?? appUser.realName ?? "Unknown";
  }

  const serializedSession = {
    id: session.id,
    title: session.title,
    status: session.status,
    sessionDateLocal: session.sessionDateLocal.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    createdBy: { id: session.createdBy.id, displayName: getDisplayName(session.createdBy) },
    completedBy: session.completedBy
      ? { id: session.completedBy.id, displayName: getDisplayName(session.completedBy) }
      : null,
    members: session.members.map((member) => ({
      id: member.user.id,
      displayName: getDisplayName(member.user),
      rankColor: member.user.rankColor,
    })),
    ghostMembers: session.ghostMembers.map((ghost) => ({
      id: ghost.id,
      displayName: ghost.displayName,
    })),
    selections: session.selections.map((selection) => ({
      id: selection.id,
      badgeId: selection.badge.id,
      badgeName: selection.badge.name,
      badgeNumber: selection.badge.badgeNumber,
      badgeDescription: selection.badge.description,
      isPerVisit: selection.badge.isPerVisit,
      selectedBy: {
        id: selection.selectedBy.id,
        displayName: getDisplayName(selection.selectedBy),
      },
    })),
    userAck: session.acknowledgements[0]
      ? {
          needsReview: session.acknowledgements[0].needsReview,
          acknowledgedAt: session.acknowledgements[0].acknowledgedAt?.toISOString() ?? null,
        }
      : null,
  };

  const serializedBadges = allBadges.map((badge) => ({
    id: badge.id,
    badgeNumber: badge.badgeNumber,
    name: badge.name,
    description: badge.description,
    playerCountBucket: badge.playerCountBucket,
    defaultDifficulty: badge.defaultDifficulty,
    isPerVisit: badge.isPerVisit,
    isMetaBadge: badge.isMetaBadge,
    rooms: badge.rooms,
    games: badge.games,
    memberCompletions: badge.userStatuses
      .filter((status) => status.isCompleted)
      .map((status) => status.userId),
    communityVotes: badge.userStatuses
      .map((status) => status.personalDifficulty)
      .filter(Boolean) as string[],
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <SessionDetailClient
        session={serializedSession}
        allBadges={serializedBadges}
        currentUserId={user.id}
        currentUserRole={user.role}
      />
    </div>
  );
}
