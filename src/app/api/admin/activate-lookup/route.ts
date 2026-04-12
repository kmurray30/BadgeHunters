import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { lookupActivatePlayer } from "@/lib/activate-lookup";
import { getRankColor } from "@/lib/rank";

/**
 * Look up a player on playactivate.com and optionally sync the score
 * to an existing user record. Admin-only.
 *
 * GET ?name=shumsby              — just look up, return result
 * GET ?name=shumsby&userId=xyz   — look up AND sync score to user
 */
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const playerName = searchParams.get("name");
  const userId = searchParams.get("userId");

  if (!playerName || playerName.trim().length === 0) {
    return NextResponse.json({ error: "name parameter is required" }, { status: 400 });
  }

  const result = await lookupActivatePlayer(playerName.trim());

  // If a userId is provided and the lookup succeeded, sync the score
  if (userId && result.found && result.score !== null) {
    const rankColor = getRankColor(result.score);
    await prisma.user.update({
      where: { id: userId },
      data: {
        currentScore: result.score,
        rankColor,
        lastScoreSource: "scrape",
        lastSyncedAt: new Date(),
        lastGoodScoreAt: new Date(),
      },
    });
    return NextResponse.json({ ...result, synced: true, rankColor });
  }

  return NextResponse.json({ ...result, synced: false });
}
