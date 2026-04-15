import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRankColor } from "@/lib/rank";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { realName, activatePlayerName, score } = body;

  if (!realName || !activatePlayerName) {
    return NextResponse.json({ error: "Name and player name are required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    realName: realName.trim(),
    activatePlayerName: activatePlayerName.trim(),
    onboardingComplete: true,
  };

  // If we got a score from the Activate lookup, sync it immediately
  if (typeof score === "number" && score > 0) {
    updateData.currentScore = score;
    updateData.rankColor = getRankColor(score);
    updateData.lastScoreSource = "scrape";
    updateData.lastSyncedAt = new Date();
    updateData.lastGoodScoreAt = new Date();
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  });

  return NextResponse.json({ success: true });
}
