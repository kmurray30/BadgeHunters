import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { realName, activatePlayerName } = body;

  if (!realName || !activatePlayerName) {
    return NextResponse.json({ error: "Name and player name are required" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      realName: realName.trim(),
      activatePlayerName: activatePlayerName.trim(),
      onboardingComplete: true,
    },
  });

  return NextResponse.json({ success: true });
}
