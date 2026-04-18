import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { isolationFilter } from "@/lib/isolation";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;

  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isolation = isolationFilter(user);

  const badge = await prisma.badge.findUnique({
    where: { id },
    include: {
      userStatuses: {
        where: { user: isolation },
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
      comments: {
        where: {
          deletedAt: null,
          author: isolation,
        },
        include: {
          author: {
            select: {
              id: true,
              activatePlayerName: true,
              realName: true,
              displayNameMode: true,
              image: true,
            },
          },
          reactions: {
            include: {
              user: { select: { id: true } },
            },
          },
        },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      },
      metaRules: { where: { active: true } },
    },
  });

  if (!badge) {
    return NextResponse.json({ error: "Badge not found" }, { status: 404 });
  }

  const currentUserStatus = badge.userStatuses.find((status) => status.userId === user.id);

  const completedByUsers = badge.userStatuses
    .filter((status) => status.isCompleted)
    .map((status) => ({
      id: status.user.id,
      displayName:
        status.user.displayNameMode === "real_name"
          ? status.user.realName ?? status.user.activatePlayerName ?? "Unknown"
          : status.user.activatePlayerName ?? status.user.realName ?? "Unknown",
      personalDifficulty: status.personalDifficulty,
    }));

  const communityDifficultyVotes = badge.userStatuses
    .filter((status) => status.personalDifficulty && status.personalDifficulty !== "unknown")
    .map((status) => status.personalDifficulty!);

  const communityPlayerCountVotes = badge.userStatuses
    .filter((status) => status.idealPlayerCountBucket && status.idealPlayerCountBucket !== "none")
    .map((status) => status.idealPlayerCountBucket!);

  const comments = badge.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    isPinned: comment.isPinned,
    editedAt: comment.editedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      displayName:
        comment.author.displayNameMode === "real_name"
          ? comment.author.realName ?? comment.author.activatePlayerName ?? "Unknown"
          : comment.author.activatePlayerName ?? comment.author.realName ?? "Unknown",
      image: comment.author.image,
    },
    reactions: comment.reactions.map((reaction) => ({
      id: reaction.id,
      reactionType: reaction.reactionType,
      userId: reaction.user.id,
    })),
  }));

  return NextResponse.json({
    badge: {
      id: badge.id,
      badgeNumber: badge.badgeNumber,
      name: badge.name,
      description: badge.description,
      rooms: badge.rooms,
      games: badge.games,
      isPerVisit: badge.isPerVisit,
      isMetaBadge: badge.isMetaBadge,
    },
    currentUserId: user.id,
    currentUserRole: user.role,
    currentUserStatus: {
      isCompleted: currentUserStatus?.isCompleted ?? false,
      personalDifficulty: currentUserStatus?.personalDifficulty ?? null,
      idealPlayerCountBucket: currentUserStatus?.idealPlayerCountBucket ?? null,
      personalNotesSummary: currentUserStatus?.personalNotesSummary ?? null,
    },
    completedByUsers,
    communityDifficultyVotes,
    communityPlayerCountVotes,
    comments,
    metaRules: badge.metaRules.map((rule) => ({
      id: rule.id,
      ruleType: rule.ruleType,
      rulePayloadJson: rule.rulePayloadJson,
    })),
  });
}
