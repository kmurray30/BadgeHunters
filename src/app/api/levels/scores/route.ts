import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isolationFilter } from "@/lib/isolation";
import { buildMyScoresGrid } from "@/lib/levels-grid";

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

  const playerIdParam = request.nextUrl.searchParams.get("playerId");
  let targetUserId = session.user.id;

  if (playerIdParam) {
    const allowedPlayer = await prisma.user.findFirst({
      where: {
        id: playerIdParam,
        ...isolationFilter(currentUser),
        isActive: true,
      },
      select: { id: true },
    });
    if (allowedPlayer) {
      targetUserId = allowedPlayer.id;
    }
  }

  const grid = await buildMyScoresGrid(targetUserId);
  return NextResponse.json(grid);
}
