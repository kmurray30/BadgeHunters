import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { lookupActivatePlayer } from "@/lib/activate-lookup";
import { getRankColor } from "@/lib/rank";

/**
 * POST /api/profile/link-activate
 *
 * One-time linking of an Activate account for users who skipped during
 * onboarding. Only works if the user doesn't already have an
 * activatePlayerName set. Once linked, this is irreversible (the user
 * edits their name via the normal profile edit flow instead).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { activatePlayerName: true },
  });

  if (currentUser?.activatePlayerName) {
    return NextResponse.json({ error: "Activate account already linked" }, { status: 400 });
  }

  const body = await request.json();
  const { activatePlayerName } = body;

  if (!activatePlayerName || typeof activatePlayerName !== "string" || !activatePlayerName.trim()) {
    return NextResponse.json({ error: "Player name is required" }, { status: 400 });
  }

  const trimmedName = activatePlayerName.trim();
  const result = await lookupActivatePlayer(trimmedName);

  if (!result.found || result.score === null) {
    return NextResponse.json({
      error: result.error || `No Activate account found for "${trimmedName}"`,
      found: false,
    }, { status: 404 });
  }

  const rankColor = getRankColor(result.score);
  const updateData: Record<string, unknown> = {
    activatePlayerName: result.activateUsername ?? trimmedName,
    currentScore: result.score,
    rankColor,
    lastScoreSource: "scrape",
    lastSyncedAt: new Date(),
    lastGoodScoreAt: new Date(),
  };
  if (result.rank !== null) updateData.activateRank = result.rank;
  if (result.leaderboardPosition) updateData.leaderboardPosition = result.leaderboardPosition;
  if (result.levelsBeat) updateData.levelsBeat = result.levelsBeat;
  if (result.coins !== null) updateData.coins = result.coins;

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  });

  return NextResponse.json({
    success: true,
    activateUsername: result.activateUsername ?? trimmedName,
    score: result.score,
    rankColor,
  });
}
