"use server";

import { prisma } from "@/lib/db";
import { requireUser, requireSuperuser } from "@/lib/session-helpers";
import { revalidatePath } from "next/cache";
import type { Difficulty, PlayerCountBucket } from "@prisma/client";

export async function toggleBadgeCompletion(badgeId: string) {
  const user = await requireUser();

  const existing = await prisma.badgeUserStatus.findUnique({
    where: { userId_badgeId: { userId: user.id, badgeId } },
  });

  if (existing) {
    await prisma.badgeUserStatus.update({
      where: { id: existing.id },
      data: {
        isCompleted: !existing.isCompleted,
        completedAt: !existing.isCompleted ? new Date() : null,
      },
    });
  } else {
    await prisma.badgeUserStatus.create({
      data: {
        userId: user.id,
        badgeId,
        isCompleted: true,
        completedAt: new Date(),
      },
    });
  }

  revalidatePath("/badges");
  revalidatePath(`/badges/${badgeId}`);
}

export async function updateBadgeDifficulty(
  badgeId: string,
  personalDifficulty: Difficulty
) {
  const user = await requireUser();

  await prisma.badgeUserStatus.upsert({
    where: { userId_badgeId: { userId: user.id, badgeId } },
    create: {
      userId: user.id,
      badgeId,
      personalDifficulty,
    },
    update: {
      personalDifficulty,
    },
  });

  revalidatePath("/badges");
  revalidatePath(`/badges/${badgeId}`);
}

export async function updateIdealPlayerCount(
  badgeId: string,
  idealPlayerCountBucket: PlayerCountBucket | null
) {
  const user = await requireUser();

  await prisma.badgeUserStatus.upsert({
    where: { userId_badgeId: { userId: user.id, badgeId } },
    create: {
      userId: user.id,
      badgeId,
      idealPlayerCountBucket,
    },
    update: {
      idealPlayerCountBucket,
    },
  });

  revalidatePath(`/badges/${badgeId}`);
}

export async function updatePersonalNotes(badgeId: string, notes: string | null) {
  const user = await requireUser();

  await prisma.badgeUserStatus.upsert({
    where: { userId_badgeId: { userId: user.id, badgeId } },
    create: {
      userId: user.id,
      badgeId,
      personalNotesSummary: notes,
    },
    update: {
      personalNotesSummary: notes,
    },
  });

  revalidatePath(`/badges/${badgeId}`);
}

export async function superuserToggleBadgeCompletion(
  badgeId: string,
  targetUserId: string
) {
  await requireSuperuser();

  const existing = await prisma.badgeUserStatus.findUnique({
    where: { userId_badgeId: { userId: targetUserId, badgeId } },
  });

  if (existing) {
    await prisma.badgeUserStatus.update({
      where: { id: existing.id },
      data: {
        isCompleted: !existing.isCompleted,
        completedAt: !existing.isCompleted ? new Date() : null,
      },
    });
  } else {
    await prisma.badgeUserStatus.create({
      data: {
        userId: targetUserId,
        badgeId,
        isCompleted: true,
        completedAt: new Date(),
      },
    });
  }

  revalidatePath("/badges");
  revalidatePath(`/badges/${badgeId}`);
}

export async function updateBadgeCatalogField(
  badgeId: string,
  field: string,
  value: unknown
) {
  await requireSuperuser();

  const allowedFields = [
    "rooms",
    "games",
    "tags",
    "playerCountBucket",
    "defaultDifficulty",
    "durationLabel",
    "isPerVisit",
    "isMetaBadge",
    "active",
  ];

  if (!allowedFields.includes(field)) {
    throw new Error(`Field ${field} is not editable`);
  }

  await prisma.badge.update({
    where: { id: badgeId },
    data: { [field]: value },
  });

  revalidatePath("/badges");
  revalidatePath(`/badges/${badgeId}`);
}
