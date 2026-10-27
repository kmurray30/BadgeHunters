import { prisma } from "@/lib/db";
import { getDisplayedDifficulty } from "@/lib/difficulty";

export interface BadgeCardData {
  id: string;
  number: number;
  name: string;
  description: string;
  games: string[];
  isPerVisit: boolean;
  /** User ids (across the roster) who have completed it */
  doneBy: string[];
  todoByMe: boolean;
  difficulty: "easy" | "medium" | "hard" | "impossible" | "unknown";
  playerCount: string;
}

export const DIFFICULTY_SORT_KEY: Record<BadgeCardData["difficulty"], number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  impossible: 4,
  unknown: 99,
};

function communityPlayerCount(votes: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    if (vote && vote !== "none") counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  return [...counts.entries()].sort((entryA, entryB) => entryB[1] - entryA[1])[0]?.[0] ?? "none";
}

/** Every active badge with who on the roster has done it, plus the current user's own flags and votes. */
export async function loadBadgeCards(currentUserId: string, rosterIds: string[]): Promise<BadgeCardData[]> {
  const badges = await prisma.badge.findMany({
    where: { active: true },
    orderBy: { badgeNumber: "asc" },
    select: {
      id: true,
      badgeNumber: true,
      name: true,
      description: true,
      games: true,
      isPerVisit: true,
      userStatuses: {
        where: { userId: { in: rosterIds } },
        select: {
          userId: true,
          isCompleted: true,
          isTodo: true,
          personalDifficulty: true,
          idealPlayerCountBucket: true,
        },
      },
    },
  });

  return badges.map((badge) => {
    const mine = badge.userStatuses.find((status) => status.userId === currentUserId);
    const personalPlayerCount = mine?.idealPlayerCountBucket;
    return {
      id: badge.id,
      number: badge.badgeNumber,
      name: badge.name,
      description: badge.description,
      games: badge.games,
      isPerVisit: badge.isPerVisit,
      doneBy: badge.userStatuses.filter((status) => status.isCompleted).map((status) => status.userId),
      todoByMe: mine?.isTodo ?? false,
      difficulty: getDisplayedDifficulty(
        mine?.personalDifficulty,
        badge.userStatuses.map((status) => status.personalDifficulty),
      ),
      playerCount:
        personalPlayerCount && personalPlayerCount !== "none"
          ? personalPlayerCount
          : communityPlayerCount(badge.userStatuses.map((status) => status.idealPlayerCountBucket)),
    };
  });
}
