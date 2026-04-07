import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { BadgeListClient } from "./badge-list-client";

export default async function BadgesPage() {
  const user = await requireUser();
  const isolation = isolationFilter(user);

  const badges = await prisma.badge.findMany({
    where: { active: true },
    orderBy: { badgeNumber: "asc" },
    include: {
      userStatuses: {
        where: {
          user: isolation,
        },
        select: {
          userId: true,
          isCompleted: true,
          personalDifficulty: true,
          idealPlayerCountBucket: true,
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
    },
  });

  // Get all users in the same isolation world for filter dropdowns
  const allUsers = await prisma.user.findMany({
    where: { ...isolation, isActive: true },
    select: {
      id: true,
      activatePlayerName: true,
      realName: true,
      displayNameMode: true,
    },
    orderBy: { activatePlayerName: "asc" },
  });

  const serializedBadges = badges.map((badge) => ({
    id: badge.id,
    badgeNumber: badge.badgeNumber,
    name: badge.name,
    description: badge.description,
    rooms: badge.rooms,
    games: badge.games,
    playerCountBucket: badge.playerCountBucket,
    tags: badge.tags,
    defaultDifficulty: badge.defaultDifficulty,
    isPerVisit: badge.isPerVisit,
    isMetaBadge: badge.isMetaBadge,
    completedByCurrentUser: badge.userStatuses.some(
      (status) => status.userId === user.id && status.isCompleted
    ),
    currentUserDifficulty:
      badge.userStatuses.find((status) => status.userId === user.id)
        ?.personalDifficulty ?? null,
    currentUserPlayerCount:
      badge.userStatuses.find((status) => status.userId === user.id)
        ?.idealPlayerCountBucket ?? null,
    communityPlayerCountVotes: badge.userStatuses
      .map((status) => status.idealPlayerCountBucket)
      .filter(Boolean) as string[],
    completedByUsers: badge.userStatuses
      .filter((status) => status.isCompleted)
      .map((status) => ({
        id: status.user.id,
        displayName:
          status.user.displayNameMode === "real_name"
            ? status.user.realName ?? status.user.activatePlayerName ?? "Unknown"
            : status.user.activatePlayerName ?? status.user.realName ?? "Unknown",
      })),
    totalCompletions: badge.userStatuses.filter((status) => status.isCompleted).length,
    communityDifficultyVotes: badge.userStatuses
      .map((status) => status.personalDifficulty)
      .filter(Boolean),
  }));

  const serializedUsers = allUsers.map((appUser) => ({
    id: appUser.id,
    displayName:
      appUser.displayNameMode === "real_name"
        ? appUser.realName ?? appUser.activatePlayerName ?? "Unknown"
        : appUser.activatePlayerName ?? appUser.realName ?? "Unknown",
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <BadgeListClient
        badges={serializedBadges}
        currentUserId={user.id}
        currentUserRole={user.role}
        allUsers={serializedUsers}
      />
    </div>
  );
}
