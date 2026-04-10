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
  const score = Number(body.score);

  if (!Number.isFinite(score) || score < 0) {
    return NextResponse.json({ error: "Invalid score" }, { status: 400 });
  }

  const rankColor = getRankColor(score);

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      currentScore: score,
      rankColor,
      lastScoreSource: "manual",
      lastSyncedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}
