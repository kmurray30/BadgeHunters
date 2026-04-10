import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await request.json();
  const { action, id } = body;

  if (action === "dismiss" && typeof id === "string") {
    // Mark a single notification's popup as dismissed
    await prisma.notification.updateMany({
      where: { id, userId },
      data: { dismissedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }

  if (action === "mark-read") {
    // Mark all unread notifications as read (triggered on bell open)
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
