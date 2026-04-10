import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { getRankColor, RANK_COLOR_HEX } from "@/lib/rank";
import { ProfileClient } from "./profile-client";

export default async function ProfilePage() {
  const user = await requireUser();

  const badgeStats = await prisma.badgeUserStatus.aggregate({
    where: { userId: user.id, isCompleted: true },
    _count: true,
  });

  const totalBadges = await prisma.badge.count({ where: { active: true } });

  const recentCompletions = await prisma.badgeUserStatus.findMany({
    where: { userId: user.id, isCompleted: true },
    orderBy: { completedAt: "desc" },
    take: 5,
    include: {
      badge: {
        select: { id: true, badgeNumber: true, name: true },
      },
    },
  });

  const rankColor = getRankColor(user.currentScore);
  const rankColorHex = RANK_COLOR_HEX[rankColor];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <ProfileClient
        user={{
          id: user.id,
          email: user.email,
          realName: user.realName,
          activatePlayerName: user.activatePlayerName,
          displayNameMode: user.displayNameMode,
          currentScore: user.currentScore,
          rankColor,
          rankColorHex,
          role: user.role,
          isTestUser: user.isTestUser,
          lastSyncedAt: user.lastSyncedAt?.toISOString() ?? null,
          lastScoreSource: user.lastScoreSource,
        }}
        badgeStats={{
          completed: badgeStats._count,
          total: totalBadges,
        }}
        recentCompletions={recentCompletions.map((completion) => ({
          badgeId: completion.badge.id,
          badgeNumber: completion.badge.badgeNumber,
          badgeName: completion.badge.name,
          completedAt: completion.completedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
