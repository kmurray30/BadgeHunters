"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { revalidatePath } from "next/cache";
import type { ReactionType } from "@prisma/client";

export async function createBadgeComment(badgeId: string, body: string) {
  const user = await requireUser();

  if (!body.trim()) {
    throw new Error("Comment body is required");
  }

  await prisma.badgeComment.create({
    data: {
      badgeId,
      authorUserId: user.id,
      body: body.trim(),
    },
  });

  revalidatePath(`/badges/${badgeId}`);
}

export async function editBadgeComment(commentId: string, body: string) {
  const user = await requireUser();

  const comment = await prisma.badgeComment.findUnique({
    where: { id: commentId },
  });

  if (!comment) throw new Error("Comment not found");
  if (comment.authorUserId !== user.id && user.role !== "superuser") {
    throw new Error("Not authorized to edit this comment");
  }

  await prisma.badgeComment.update({
    where: { id: commentId },
    data: {
      body: body.trim(),
      editedAt: new Date(),
    },
  });

  revalidatePath(`/badges/${comment.badgeId}`);
}

export async function deleteBadgeComment(commentId: string) {
  const user = await requireUser();

  const comment = await prisma.badgeComment.findUnique({
    where: { id: commentId },
  });

  if (!comment) throw new Error("Comment not found");
  if (comment.authorUserId !== user.id && user.role !== "superuser") {
    throw new Error("Not authorized to delete this comment");
  }

  await prisma.badgeComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date() },
  });

  revalidatePath(`/badges/${comment.badgeId}`);
}

export async function toggleCommentPin(commentId: string) {
  const user = await requireUser();
  if (user.role !== "superuser") {
    throw new Error("Only superusers can pin comments");
  }

  const comment = await prisma.badgeComment.findUnique({
    where: { id: commentId },
  });

  if (!comment) throw new Error("Comment not found");

  await prisma.badgeComment.update({
    where: { id: commentId },
    data: { isPinned: !comment.isPinned },
  });

  revalidatePath(`/badges/${comment.badgeId}`);
}

export async function toggleCommentReaction(commentId: string, reactionType: ReactionType) {
  const user = await requireUser();

  const existing = await prisma.badgeCommentReaction.findUnique({
    where: {
      commentId_userId_reactionType: {
        commentId,
        userId: user.id,
        reactionType,
      },
    },
  });

  if (existing) {
    await prisma.badgeCommentReaction.delete({
      where: { id: existing.id },
    });
  } else {
    await prisma.badgeCommentReaction.create({
      data: {
        commentId,
        userId: user.id,
        reactionType,
      },
    });
  }

  const comment = await prisma.badgeComment.findUnique({
    where: { id: commentId },
  });
  if (comment) {
    revalidatePath(`/badges/${comment.badgeId}`);
  }
}
