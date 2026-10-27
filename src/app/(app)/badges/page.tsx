import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { getDisplayedDifficulty } from "@/lib/difficulty";
import { loadRoster } from "@/lib/roster";
import { BadgesClient, type BadgeCardData } from "./badges-client";

function communityPlayerCount(votes: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    if (vote && vote !== "none") counts.set(vote, (counts.get(vote) ?? 0) + 1);
  }
  return [...counts.entries()].sort((entryA, entryB) => entryB[1] - entryA[1])[0]?.[0] ?? "none";
}

export default async function BadgesPage() {
  const user = await requireUser();
  const roster = await loadRoster(user);
  const rosterIds = roster.map((player) => player.id);

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

  const cards: BadgeCardData[] = badges.map((badge) => {
    const mine = badge.userStatuses.find((status) => status.userId === user.id);
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

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5">
      <BadgesClient badges={cards} roster={roster} currentUserId={user.id} />
    </div>
  );
}
