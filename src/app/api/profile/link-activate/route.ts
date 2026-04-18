import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/profile/link-activate
 *
 * One-time linking of an Activate account for users who skipped during
 * onboarding. Only works if the user doesn't already have an
 * activatePlayerName set. Saves the name as-is without live verification.
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

  await prisma.user.update({
    where: { id: session.user.id },
    data: { activatePlayerName: trimmedName },
  });

  return NextResponse.json({ success: true, activateUsername: trimmedName });
}
