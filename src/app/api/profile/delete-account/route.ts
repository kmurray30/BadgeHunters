import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/profile/delete-account
 *
 * Lets a signed-in user permanently delete their own account.
 * The client must supply the user's activatePlayerName as confirmation.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isTestUser: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Sessions created by this user can't be orphaned — remove them.
  // Sessions merely completed by them can have that field nulled out.
  await prisma.session.deleteMany({ where: { createdByUserId: userId } });
  await prisma.session.updateMany({
    where: { completedByUserId: userId },
    data: { completedByUserId: null },
  });

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
