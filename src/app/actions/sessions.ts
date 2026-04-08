"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session-helpers";
import { revalidatePath } from "next/cache";

/**
 * Create a new session. Expires at 6am PST/PDT the day after the session date.
 * @param dateString - YYYY-MM-DD string for the session date (defaults to today in LA timezone)
 */
export async function createSession(memberUserIds: string[], ghostNames: string[], dateString?: string) {
  const user = await requireUser();

  let sessionDate: Date;
  if (dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    sessionDate = new Date(year, month - 1, day);
  } else {
    const nowLA = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })
    );
    sessionDate = new Date(nowLA.getFullYear(), nowLA.getMonth(), nowLA.getDate());
  }

  // Expires at 6am the day after the SESSION date (not creation date)
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

  // Verify the remover is a session member
  const membership = await prisma.sessionMember.findUnique({
    where: { sessionId_userId: { sessionId, userId: user.id } },
  });
  if (!membership) {
    throw new Error("Only session members can remove members");
  }

  await prisma.sessionMember.delete({
    where: { sessionId_userId: { sessionId, userId } },
  });

  // Clean up their acknowledgement too
  await prisma.sessionUserAcknowledgement.deleteMany({
    where: { sessionId, userId },
  });

  // Clean up their badge selections
  await prisma.sessionBadgeSelection.deleteMany({
    where: { sessionId, selectedByUserId: userId },
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

/**
 * Cancel review mode and revert the session back to active for all players.
 * Resets all acknowledgements and clears the completed state.
 */
export async function cancelSessionReview(sessionId: string) {
  await requireUser();

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || session.status !== "completed_pending_ack") {
    throw new Error("Session is not in review mode");
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "active",
      completedAt: null,
      completedByUserId: null,
    },
  });

  await prisma.sessionUserAcknowledgement.updateMany({
    where: { sessionId },
    data: {
      needsReview: true,
      acknowledgedAt: null,
    },
  });

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
}

/**
 * Revert a completed/closed session straight back to active.
 * Resets all member acknowledgements so everyone is back to square one.
 * Used for current-day "Re-open" — past-day editing is client-side only.
 */
export async function reopenSession(sessionId: string) {
  await requireUser();

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || (session.status !== "completed_pending_ack" && session.status !== "closed")) {
    throw new Error("Session is not in a completed or closed state");
  }

  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "active",
      completedAt: null,
      completedByUserId: null,
    },
  });

  await prisma.sessionUserAcknowledgement.updateMany({
    where: { sessionId },
    data: {
      needsReview: true,
      acknowledgedAt: null,
    },
  });

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

/**
 * Toggle a badge's completion state within the context of a specific session.
 *
 * Checking: creates a SessionBadgeCompletion record AND marks the badge as persistently
 * completed in BadgeUserStatus, since completing something in a session means you got it.
 *
 * Unchecking: removes the SessionBadgeCompletion record. Optionally also un-completes the
 * badge in BadgeUserStatus if the user explicitly chose that in the confirmation popup.
 */
export async function toggleSessionBadgeCompletion(
  sessionId: string,
  badgeId: string,
  alsoUncompletePersistently = false,
) {
  const user = await requireUser();

  const existing = await prisma.sessionBadgeCompletion.findUnique({
    where: { sessionId_userId_badgeId: { sessionId, userId: user.id, badgeId } },
  });

  if (existing) {
    await prisma.sessionBadgeCompletion.delete({ where: { id: existing.id } });

    if (alsoUncompletePersistently) {
      await prisma.badgeUserStatus.upsert({
        where: { userId_badgeId: { userId: user.id, badgeId } },
        update: { isCompleted: false, completedAt: null },
        create: { userId: user.id, badgeId, isCompleted: false },
      });
    }
  } else {
    await prisma.sessionBadgeCompletion.create({
      data: { sessionId, userId: user.id, badgeId },
    });

    await prisma.badgeUserStatus.upsert({
      where: { userId_badgeId: { userId: user.id, badgeId } },
      update: { isCompleted: true, completedAt: new Date() },
      create: { userId: user.id, badgeId, isCompleted: true, completedAt: new Date() },
    });
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/badges");
  revalidatePath(`/badges/${badgeId}`);
}
