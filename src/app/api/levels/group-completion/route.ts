import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isolationFilter } from "@/lib/isolation";
import {
  buildGroupCompletionGrid,
  groupCompletionPlayerSelect,
  mapGroupCompletionPlayers,
} from "@/lib/levels-grid";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playerIdsParam = request.nextUrl.searchParams.get("playerIds");
  let playerIds: string[];

  if (playerIdsParam) {
    const requestedIds = playerIdsParam.split(",").filter(Boolean);
    const allowedPlayers = await prisma.user.findMany({
      where: {
        ...isolationFilter(currentUser),
        isActive: true,
        id: { in: requestedIds },
      },
      select: { id: true },
    });
    playerIds = allowedPlayers.map((player) => player.id);
  } else {
    const allPlayers = await prisma.user.findMany({
      where: { ...isolationFilter(currentUser), isActive: true },
      select: { id: true },
    });
    playerIds = allPlayers.map((player) => player.id);
  }

  const grid = await buildGroupCompletionGrid(playerIds);

  const players = await prisma.user.findMany({
    where: { ...isolationFilter(currentUser), isActive: true },
    orderBy: { currentScore: "desc" },
    select: groupCompletionPlayerSelect,
  });

  return NextResponse.json({
    ...grid,
    players: mapGroupCompletionPlayers(players),
  });
}
