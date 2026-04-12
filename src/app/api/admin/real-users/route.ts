import { NextResponse } from "next/server";
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
