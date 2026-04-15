import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

/**
 * List all real (non-test) users — admin mode only.
 * Used by the login page to let admins log in as any real user.
 */
export async function GET() {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const realUsers = await prisma.user.findMany({
    where: { isTestUser: false, isActive: true },
    orderBy: { activatePlayerName: "asc" },
    select: {
      id: true,
      activatePlayerName: true,
      realName: true,
      googleAccountName: true,
      role: true,
      currentScore: true,
      rankColor: true,
      email: true,
      createdAt: true,
      _count: {
        select: {
          badgeStatuses: { where: { isCompleted: true } },
        },
      },
    },
  });

  const serializedUsers = realUsers.map((user) => ({
    id: user.id,
    displayName: user.activatePlayerName ?? user.realName ?? user.googleAccountName ?? user.email ?? "Unknown",
    activatePlayerName: user.activatePlayerName,
    realName: user.realName,
    role: user.role,
    currentScore: user.currentScore,
    rankColor: user.rankColor,
    badgesCompleted: user._count.badgeStatuses,
    createdAt: user.createdAt.toISOString(),
  }));

  return NextResponse.json({ users: serializedUsers });
}

/**
 * Delete a real user — admin mode only.
 * Clears session references that don't cascade, then deletes the user
 * (all other relations cascade). The user can re-create their account
 * via Google OAuth and go through onboarding fresh.
 */
export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const body = await request.json();
  const { userId } = body;

  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "User ID required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isTestUser: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (targetUser.isTestUser) {
    return NextResponse.json({ error: "Use the test-users endpoint for test users" }, { status: 400 });
  }

  // Session.createdBy and Session.completedBy don't cascade,
  // so clean those up before deleting the user.
  await prisma.session.deleteMany({ where: { createdByUserId: userId } });
  await prisma.session.updateMany({
    where: { completedByUserId: userId },
    data: { completedByUserId: null },
  });

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
