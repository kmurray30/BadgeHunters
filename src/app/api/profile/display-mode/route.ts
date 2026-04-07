import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { mode } = body;

  if (mode !== "player_name" && mode !== "real_name") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { displayNameMode: mode },
  });

  return NextResponse.json({ success: true });
}
