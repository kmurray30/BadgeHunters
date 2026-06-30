import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getRankColor } from "@/lib/rank";
import {
  lookupActivatePlayer,
  scrapedFieldsFromLookup,
} from "@/lib/activate-lookup";

export const maxDuration = 60;

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
 * Create a real user for local dev — admin mode only.
 * No Google OAuth link; use admin login to sign in as this user.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const body = await request.json();
  const { displayName } = body;

  if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json({ error: "Display name required" }, { status: 400 });
  }

  const trimmedName = displayName.trim();

  const lookup = await lookupActivatePlayer(trimmedName);
  if (!lookup.found) {
    return NextResponse.json(
      { error: lookup.error ?? "Player not found on playactivate.com" },
      { status: 404 },
    );
  }

  const activatePlayerName = lookup.activateUsername ?? trimmedName;

  const existingUser = await prisma.user.findFirst({
    where: {
      activatePlayerName: { equals: activatePlayerName, mode: "insensitive" },
      isTestUser: false,
    },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "A real user with that Activate name already exists" },
      { status: 409 },
    );
  }

  const realUser = await prisma.user.create({
    data: {
      authType: "google",
      role: "user",
      activatePlayerName,
      realName: activatePlayerName,
      isTestUser: false,
      onboardingComplete: true,
      ...scrapedFieldsFromLookup(lookup),
      ...(lookup.score === null
        ? { currentScore: 0, rankColor: getRankColor(0) }
        : {}),
    },
  });

  return NextResponse.json(
    {
      user: realUser,
      lookup: {
        score: lookup.score,
        rank: lookup.rank,
        leaderboardPosition: lookup.leaderboardPosition,
        levelsBeat: lookup.levelsBeat,
        coins: lookup.coins,
      },
    },
    { status: 201 },
  );
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
