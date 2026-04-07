"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { revalidatePath } from "next/cache";

/**
 * Create a new session for today. Expires at 6am PST/PDT the following day.
 */
export async function createSession(memberUserIds: string[], ghostNames: string[]) {
  const user = await requireUser();

  // Session date = today in America/Los_Angeles
  const nowLA = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
  );
  const sessionDate = new Date(nowLA.getFullYear(), nowLA.getMonth(), nowLA.getDate());

  // Expires at 6am PST/PDT the following day
  const expiresAt = new Date(sessionDate);
  expiresAt.setDate(expiresAt.getDate() + 1);
  expiresAt.setHours(6, 0, 0, 0);

  const session = await prisma.session.create({
    data: {
      createdByUserId: user.id,
      sessionDateLocal: sessionDate,
      expiresAt,
      members: {
        create: [
          // Creator is always a member
          { userId: user.id, addedByUserId: user.id },
          // Add other specified members
          ...memberUserIds
            .filter((memberId) => memberId !== user.id)
            .map((memberId) => ({
              userId: memberId,
              addedByUserId: user.id,
            })),
        ],
      },
      ghostMembers: {
        create: ghostNames
          .filter((name) => name.trim())
          .map((name) => ({ displayName: name.trim() })),
      },
    },
  });

  // Create acknowledgement records for all real members
  const allMemberIds = [user.id, ...memberUserIds.filter((memberId) => memberId !== user.id)];
  await prisma.sessionUserAcknowledgement.createMany({
    data: allMemberIds.map((memberId) => ({
      sessionId: session.id,
      userId: memberId,
    })),
  });

  revalidatePath("/sessions");
  return session.id;
}

export async function addSessionMember(sessionId: string, userId: string) {
  const user = await requireUser();

  // Verify the adder is a session member
  const membership = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId: user.id } },
  });
  if (!membership) {
    throw new Error("Only session members can add other members");
  }

  await prisma.sessionMember.create({
    data: {
      sessionId,
      userId,
      addedByUserId: user.id,
    },
  });

  await prisma.sessionUserAcknowledgement.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    create: { sessionId, userId },
    update: {},
  });

  revalidatePath(`/sessions/${sessionId}`);
}

/**
 * Let a user join a session they're not already a member of.
 * Per user request, allow self-joining.
 */
export async function joinSession(sessionId: string) {
  const user = await requireUser();

  const existing = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId: user.id } },
  });
  if (existing) return;

  await prisma.sessionMember.create({
    data: {
      sessionId,
      userId: user.id,
      addedByUserId: user.id,
    },
  });

  await prisma.sessionUserAcknowledgement.upsert({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    create: { sessionId, userId: user.id },
    update: {},
  });

  revalidatePath(`/sessions/${sessionId}`);
}

export async function removeSessionMember(sessionId: string, userId: string) {
  const user = await requireUser();

  // Users can only remove themselves
  if (userId !== user.id) {
    throw new Error("You can only remove yourself from a session");
  }

  await prisma.sessionMember.delete({
    where: { sessionId_userId: { sessionId, userId } },
  });

  revalidatePath(`/sessions/${sessionId}`);
}

export async function addGhostMember(sessionId: string, displayName: string) {
  await requireUser();

  await prisma.sessionGhostMember.create({
    data: { sessionId, displayName: displayName.trim() },
  });

  revalidatePath(`/sessions/${sessionId}`);
}

export async function removeGhostMember(ghostMemberId: string) {
  await requireUser();

  const ghost = await prisma.sessionGhostMember.findUnique({
    where: { id: ghostMemberId },
  });
  if (!ghost) throw new Error("Ghost member not found");

  await prisma.sessionGhostMember.delete({
    where: { id: ghostMemberId },
  });

  revalidatePath(`/sessions/${ghost.sessionId}`);
}

export async function toggleBadgeSelection(sessionId: string, badgeId: string) {
  const user = await requireUser();

  const existing = await prisma.sessionBadgeSelection.findUnique({
    where: {
      sessionId_badgeId_selectedByUserId: {
        sessionId,
        badgeId,
        selectedByUserId: user.id,
      },
    },
  });

  if (existing) {
    await prisma.sessionBadgeSelection.delete({
      where: { id: existing.id },
    });
  } else {
    await prisma.sessionBadgeSelection.create({
      data: {
        sessionId,
        badgeId,
        selectedByUserId: user.id,
      },
    });
  }

  revalidatePath(`/sessions/${sessionId}`);
}

export async function completeSession(sessionId: string) {
  const user = await requireUser();

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "completed_pending_ack",
      completedAt: new Date(),
      completedByUserId: user.id,
    },
  });

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
}

export async function acknowledgeSession(sessionId: string) {
  const user = await requireUser();

  await prisma.sessionUserAcknowledgement.update({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    data: {
      acknowledgedAt: new Date(),
      needsReview: false,
    },
  });

  // Check if all members have acknowledged — if so, close the session
  const pendingAcks = await prisma.sessionUserAcknowledgement.count({
    where: {
      sessionId,
      needsReview: true,
    },
  });

  if (pendingAcks === 0) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "closed" },
    });
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
}

export async function dismissSessionReview(sessionId: string) {
  const user = await requireUser();

  await prisma.sessionUserAcknowledgement.update({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    data: {
      dismissedAt: new Date(),
    },
  });

  revalidatePath(`/sessions/${sessionId}`);
}
