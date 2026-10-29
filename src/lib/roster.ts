import { prisma } from "@/lib/db";
import { isolationFilter, type IsolationUser } from "@/lib/isolation";
import { assignPlayerColors, playerRankColor } from "@/lib/player-colors";
import type { RankColor } from "@/lib/rank";

/** A player as the Badges/Levels pages see them: name, pie color, rank. */
export interface RosterPlayer {
  id: string;
  name: string;
  color: string;
  rankColor: RankColor;
  currentScore: number;
  isMe: boolean;
  /** False for players someone added who haven't signed up themselves yet */
  hasAccount: boolean;
}

export function playerDisplayName(user: {
  displayNameMode: string;
  realName: string | null;
  activatePlayerName: string | null;
}): string {
  return user.displayNameMode === "real_name"
    ? user.realName ?? user.activatePlayerName ?? "Unknown"
    : user.activatePlayerName ?? user.realName ?? "Unknown";
}

/** Everyone in the current user's world (real or test), current user first, then by score. */
export async function loadRoster(currentUser: IsolationUser & { id: string }): Promise<RosterPlayer[]> {
  const users = await prisma.user.findMany({
    where: { ...isolationFilter(currentUser), isActive: true },
    select: {
      id: true,
      displayNameMode: true,
      realName: true,
      activatePlayerName: true,
      currentScore: true,
      rankColor: true,
      createdAt: true,
      email: true,
      isTestUser: true,
    },
  });

  const colors = assignPlayerColors(users);
  return users
    .map((user) => ({
      id: user.id,
      name: playerDisplayName(user),
      color: colors.get(user.id)!,
      rankColor: playerRankColor(user),
      currentScore: user.currentScore,
      isMe: user.id === currentUser.id,
      hasAccount: user.email !== null || user.isTestUser,
    }))
    .sort((playerA, playerB) => Number(playerB.isMe) - Number(playerA.isMe) || playerB.currentScore - playerA.currentScore);
}
