import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getRankColor } from "@/lib/rank";

/**
 * Templates for pre-populating test users with realistic data.
 * Each template defines a score, badge count range, and difficulty preferences
 * so the test world isn't a barren wasteland.
 */
interface TestUserTemplate {
  score: number;
  badgeCompletionCount: number;
  /** Which badge numbers to always complete (we'll fill the rest randomly) */
  priorityBadges: number[];
  difficultyPreference: "easy" | "medium" | "hard" | "impossible" | null;
}

const TEST_USER_TEMPLATES: TestUserTemplate[] = [
  {
    // Casual player — low score, completed a handful of easy badges
    score: 45_000,
    badgeCompletionCount: 8,
    priorityBadges: [34, 55, 63, 101],
    difficultyPreference: "easy",
  },
  {
    // Regular player — mid score, decent progress on badges
    score: 175_000,
    badgeCompletionCount: 25,
    priorityBadges: [34, 47, 55, 63, 81, 101, 17, 44],
    difficultyPreference: "medium",
  },
  {
    // Dedicated hunter — high score, many badges done
    score: 350_000,
    badgeCompletionCount: 50,
    priorityBadges: [34, 47, 55, 63, 81, 101, 17, 44, 19, 48, 49, 51, 54, 66, 80],
    difficultyPreference: "hard",
  },
  {
    // Veteran — very high score, nearly all badges
    score: 520_000,
    badgeCompletionCount: 75,
    priorityBadges: [1, 2, 13, 14, 15, 17, 18, 19, 34, 47, 48, 49, 51, 54, 55, 58, 63, 66, 77, 80, 81, 82, 84, 86, 87, 101, 102],
    difficultyPreference: "impossible",
  },
  {
    // Newbie — just started, barely any badges
    score: 12_000,
    badgeCompletionCount: 3,
    priorityBadges: [63, 101],
    difficultyPreference: null,
  },
];

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const testUsers = await prisma.user.findMany({
    where: { isTestUser: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      activatePlayerName: true,
      realName: true,
      role: true,
      currentScore: true,
      rankColor: true,
      createdAt: true,
      _count: {
        select: {
          badgeStatuses: { where: { isCompleted: true } },
        },
      },
    },
  });

  const serializedTestUsers = testUsers.map((testUser) => ({
    id: testUser.id,
    activatePlayerName: testUser.activatePlayerName,
    realName: testUser.realName,
    role: testUser.role,
    currentScore: testUser.currentScore,
    rankColor: testUser.rankColor,
    badgesCompleted: testUser._count.badgeStatuses,
    createdAt: testUser.createdAt.toISOString(),
  }));

  return NextResponse.json({ testUsers: serializedTestUsers });
}

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

  const existingUser = await prisma.user.findFirst({
    where: {
      activatePlayerName: trimmedName,
      isTestUser: true,
    },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "A test user with that name already exists" },
      { status: 409 }
    );
  }

  // Pick a template by cycling based on current test user count
  const existingTestUserCount = await prisma.user.count({ where: { isTestUser: true } });
  const template = TEST_USER_TEMPLATES[existingTestUserCount % TEST_USER_TEMPLATES.length];
  const rankColor = getRankColor(template.score);

  const testUser = await prisma.user.create({
    data: {
      authType: "test",
      role: "superuser",
      activatePlayerName: trimmedName,
      realName: trimmedName,
      isTestUser: true,
      onboardingComplete: true,
      currentScore: template.score,
      rankColor: rankColor,
      lastScoreSource: "test_override",
    },
  });

  // Populate badge completions based on template
  const allBadges = await prisma.badge.findMany({
    where: { active: true },
    select: { id: true, badgeNumber: true },
    orderBy: { badgeNumber: "asc" },
  });

  // Start with priority badges, then fill randomly up to the target count
  const badgesByNumber = new Map(allBadges.map((badge) => [badge.badgeNumber, badge.id]));
  const completedBadgeIds = new Set<string>();

  for (const priorityBadgeNum of template.priorityBadges) {
    const badgeId = badgesByNumber.get(priorityBadgeNum);
    if (badgeId) completedBadgeIds.add(badgeId);
  }

  // Fill remaining slots with random badges
  const remainingBadges = allBadges.filter((badge) => !completedBadgeIds.has(badge.id));
  const shuffledRemaining = remainingBadges.sort(() => Math.random() - 0.5);
  const slotsToFill = Math.max(0, template.badgeCompletionCount - completedBadgeIds.size);
  for (let slotIndex = 0; slotIndex < slotsToFill && slotIndex < shuffledRemaining.length; slotIndex++) {
    completedBadgeIds.add(shuffledRemaining[slotIndex].id);
  }

  // Bulk create badge statuses
  if (completedBadgeIds.size > 0) {
    const statusRecords = Array.from(completedBadgeIds).map((badgeId) => ({
      userId: testUser.id,
      badgeId: badgeId,
      isCompleted: true,
      completedAt: new Date(),
      personalDifficulty: template.difficultyPreference as "easy" | "medium" | "hard" | "impossible" | null,
    }));

    await prisma.badgeUserStatus.createMany({ data: statusRecords });
  }

  return NextResponse.json({
    user: testUser,
    templateApplied: {
      score: template.score,
      rankColor,
      badgesCompleted: completedBadgeIds.size,
    },
  }, { status: 201 });
}

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

  if (!targetUser.isTestUser) {
    return NextResponse.json({ error: "Cannot delete non-test users" }, { status: 403 });
  }

  // Session.createdBy and Session.completedBy don't cascade on delete,
  // so we need to nuke sessions this user created and clear completedBy references.
  await prisma.session.deleteMany({ where: { createdByUserId: userId } });
  await prisma.session.updateMany({
    where: { completedByUserId: userId },
    data: { completedByUserId: null },
  });

  // Now the user.delete cascade handles everything else (badge statuses, comments, etc.)
  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
