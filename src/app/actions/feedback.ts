"use server";

import { prisma } from "@/lib/db";
import { requireUser, requireSuperuser } from "@/lib/session-helpers";
import { revalidatePath } from "next/cache";
import type { FeedbackStatus, ReactionType } from "@prisma/client";

export async function createFeedbackPost(body: string) {
  const user = await requireUser();

  if (!body.trim()) {
    throw new Error("Feedback body is required");
  }

  await prisma.feedbackPost.create({
    data: {
      authorUserId: user.id,
      body: body.trim(),
    },
  });

  revalidatePath("/feedback");
}

export async function editFeedbackPost(postId: string, body: string) {
  const user = await requireUser();

  const post = await prisma.feedbackPost.findUnique({
    where: { id: postId },
  });

  if (!post) throw new Error("Feedback post not found");
  if (post.authorUserId !== user.id) {
    throw new Error("Not authorized to edit this feedback");
  }

  await prisma.feedbackPost.update({
    where: { id: postId },
    data: {
      body: body.trim(),
      editedAt: new Date(),
    },
  });

  revalidatePath("/feedback");
}

export async function updateFeedbackStatus(postId: string, status: FeedbackStatus) {
  await requireSuperuser();

  await prisma.feedbackPost.update({
    where: { id: postId },
    data: { status },
  });

  revalidatePath("/feedback");
}

export async function toggleFeedbackReaction(postId: string, reactionType: ReactionType) {
  const user = await requireUser();

  const existing = await prisma.feedbackReaction.findUnique({
    where: {
      feedbackPostId_userId_reactionType: {
        feedbackPostId: postId,
        userId: user.id,
        reactionType,
      },
    },
  });

  if (existing) {
    await prisma.feedbackReaction.delete({
      where: { id: existing.id },
    });
  } else {
    await prisma.feedbackReaction.create({
      data: {
        feedbackPostId: postId,
        userId: user.id,
        reactionType,
      },
    });
  }

  revalidatePath("/feedback");
}
