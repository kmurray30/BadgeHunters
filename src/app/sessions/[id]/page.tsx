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

  const todayString = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date());
  const memberIds = session.members.map((member) => member.user.id);
  const isMember = memberIds.includes(user.id);

  // Fetch badge IDs that this user marked as completed specifically within this session.
  // This is separate from BadgeUserStatus.isCompleted (global persistent state) — it lets
  // old sessions show their own completion snapshot rather than reflecting later completions.
  const sessionCompletions = await prisma.sessionBadgeCompletion.findMany({
    where: { sessionId: id, userId: user.id },
    select: { badgeId: true },
  });

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
          idealPlayerCountBucket: true,
        },
      },
      metaRules: {
        where: { active: true },
      },
    },
  });

  // Fetch available users for "add member" UI (same-world, not already members)
  const availableUsersForAdd = isMember
    ? await prisma.user.findMany({
        where: {
          ...isolation,
          isActive: true,
          id: { notIn: memberIds },
        },
        select: {
          id: true,
          activatePlayerName: true,
          realName: true,
          displayNameMode: true,
        },
        orderBy: { activatePlayerName: "asc" },
      })
    : [];

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
    sessionDateDisplay: session.sessionDateLocal.toLocaleDateString("en-US", {
      timeZone: "UTC",
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    }),
    sessionDateLA: new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(session.sessionDateLocal),
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

  // Build meta rule blurbs keyed by badgeId
  const metaRuleBlurbs: Record<string, string> = {};
  for (const badge of allBadges) {
    if (!badge.isMetaBadge || badge.metaRules.length === 0) continue;
    const blurbs: string[] = [];
    for (const rule of badge.metaRules) {
      const payload = rule.rulePayloadJson as Record<string, unknown>;
      switch (rule.ruleType) {
        case "time_window":
          blurbs.push(`Active ${payload.start}–${payload.end}`);
          break;
        case "day_of_month":
          blurbs.push(payload.match === "last_day_only" ? "Last day of month only" : `Days: ${(payload.days as number[]).join(", ")}`);
          break;
        case "unique_rank_colors":
          blurbs.push(`Needs ${payload.min_distinct_colors} distinct rank colors in party`);
          break;
        default:
          blurbs.push(`Special condition: ${rule.ruleType}`);
      }
    }
    metaRuleBlurbs[badge.id] = blurbs.join(" · ");
  }

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
    currentUserPlayerCount:
      badge.userStatuses.find((status) => status.userId === user.id)
        ?.idealPlayerCountBucket ?? null,
    communityPlayerCountVotes: badge.userStatuses
      .map((status) => status.idealPlayerCountBucket)
      .filter(Boolean) as string[],
  }));

  const serializedAvailableUsers = availableUsersForAdd.map((appUser) => ({
    id: appUser.id,
    displayName: getDisplayName(appUser),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <SessionDetailClient
        session={serializedSession}
        allBadges={serializedBadges}
        currentUserId={user.id}
        currentUserRole={user.role}
        isMember={isMember}
        availableUsersForAdd={serializedAvailableUsers}
        metaRuleBlurbs={metaRuleBlurbs}
        todayString={todayString}
        sessionCompletedBadgeIds={sessionCompletions.map((completion) => completion.badgeId)}
      />
    </div>
  );
}
