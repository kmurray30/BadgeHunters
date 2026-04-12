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

  // Notify all non-creator members that they've been added
  const nonCreatorMemberIds = memberUserIds.filter((memberId) => memberId !== user.id);
  if (nonCreatorMemberIds.length > 0) {
    await prisma.notification.createMany({
      data: nonCreatorMemberIds.map((memberId) => ({
        userId: memberId,
        type: "session_added" as const,
        sessionId: session.id,
      })),
    });
  }

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

  // Notify the added user (not for self-joins — this is for being added by someone else)
  if (userId !== user.id) {
    await prisma.notification.create({
      data: { userId, type: "session_added", sessionId },
    });
  }

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

  // Clean up their notifications for this session
  await prisma.notification.deleteMany({
    where: { sessionId, userId },
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


/**
 * Complete the current user's review. If the session is still `active`, this
 * also transitions it to `completed_pending_ack`. Notifies other members who
 * still need to review (skips members who already completed). When all members
 * are done, auto-closes the session.
 */
export async function completeMyReview(sessionId: string) {
  const user = await requireUser();

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("Session not found");
  if (session.status === "closed") throw new Error("Session is already closed");

  // If still active, transition to completed_pending_ack
  if (session.status === "active") {
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "completed_pending_ack",
        completedAt: new Date(),
        completedByUserId: user.id,
      },
    });
  }

  // Mark the caller's review as done
  await prisma.sessionUserAcknowledgement.update({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    data: { acknowledgedAt: new Date(), needsReview: false },
  });

  // Delete this user's review notification
  await prisma.notification.deleteMany({
    where: { sessionId, userId: user.id, type: "session_review" },
  });

  // Check if everyone is done → close
  const pendingAcks = await prisma.sessionUserAcknowledgement.count({
    where: { sessionId, needsReview: true },
  });
  if (pendingAcks === 0) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "closed" },
    });
    await prisma.notification.deleteMany({
      where: { sessionId, type: "session_review" },
    });
  } else {
    // Notify members who still need review and don't already have a notification
    const membersStillPending = await prisma.sessionUserAcknowledgement.findMany({
      where: { sessionId, needsReview: true, userId: { not: user.id } },
      select: { userId: true },
    });
    const existingNotifUserIds = new Set(
      (await prisma.notification.findMany({
        where: { sessionId, type: "session_review" },
        select: { userId: true },
      })).map((notification) => notification.userId)
    );
    const membersToNotify = membersStillPending.filter(
      (member) => !existingNotifUserIds.has(member.userId)
    );
    if (membersToNotify.length > 0) {
      await prisma.notification.createMany({
        data: membersToNotify.map((member) => ({
          userId: member.userId,
          type: "session_review" as const,
          sessionId,
        })),
      });
    }
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
}

/**
 * Per-user cancel: the current user un-completes their own review.
 * Only allowed when the session date has NOT passed.
 * Does NOT affect other users' states.
 *
 * If all users end up un-completed while in `completed_pending_ack`,
 * the session reverts to `active`.
 */
export async function cancelMyReview(sessionId: string) {
  const user = await requireUser();

  // Reset only this user's ack
  await prisma.sessionUserAcknowledgement.update({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    data: { needsReview: true, acknowledgedAt: null },
  });

  // Delete this user's review notification
  await prisma.notification.deleteMany({
    where: { sessionId, userId: user.id, type: "session_review" },
  });

  // If everyone is now un-completed, revert session to active
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (session?.status === "completed_pending_ack") {
    const doneCount = await prisma.sessionUserAcknowledgement.count({
      where: { sessionId, needsReview: false },
    });
    if (doneCount === 0) {
      await prisma.session.update({
        where: { id: sessionId },
        data: { status: "active", completedAt: null, completedByUserId: null },
      });
      // Clean up all review notifications since session is back to active
      await prisma.notification.deleteMany({
        where: { sessionId, type: "session_review" },
      });
    }
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
}

/**
 * Global reopen: reverts session to active and resets ALL acknowledgements.
 * Used for current-day "Re-open" — past-day editing is client-side only.
 */
/**
 * Personal re-open: resets only the caller's ack. If the session is `closed`,
 * it transitions to `completed_pending_ack`. If all members have now
 * uncompleted, reverts all the way to `active`.
 */
export async function reopenSession(sessionId: string) {
  const user = await requireUser();

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session || (session.status !== "completed_pending_ack" && session.status !== "closed")) {
    throw new Error("Session is not in a completed or closed state");
  }

  // Reset only the caller's ack
  await prisma.sessionUserAcknowledgement.update({
    where: { sessionId_userId: { sessionId, userId: user.id } },
    data: { needsReview: true, acknowledgedAt: null },
  });

  // Delete this user's review notification
  await prisma.notification.deleteMany({
    where: { sessionId, userId: user.id, type: "session_review" },
  });

  // If session was closed, at least one person now needs review → completed_pending_ack
  if (session.status === "closed") {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "completed_pending_ack" },
    });
  }

  // If ALL members are now uncompleted, revert to active
  const doneCount = await prisma.sessionUserAcknowledgement.count({
    where: { sessionId, needsReview: false },
  });
  if (doneCount === 0) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "active", completedAt: null, completedByUserId: null },
    });
    await prisma.notification.deleteMany({
      where: { sessionId, type: "session_review" },
    });
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
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
