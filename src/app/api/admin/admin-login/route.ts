import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encode } from "next-auth/jwt";

/**
 * Log in as ANY user (real or test) — admin mode only.
 * Creates a JWT session token for the selected user.
 */
export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const body = await request.json();
  const { userId } = body;

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { lastLoginAt: new Date() },
  });

  const token = await encode({
    token: {
      userId: targetUser.id,
      role: targetUser.role,
      isTestUser: targetUser.isTestUser,
      onboardingComplete: targetUser.onboardingComplete,
      name: targetUser.activatePlayerName ?? targetUser.realName ?? targetUser.googleAccountName,
      email: targetUser.email,
    },
    secret: process.env.AUTH_SECRET!,
    salt: process.env.NODE_ENV === "production"
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
  });

  const response = NextResponse.json({ success: true });

  const cookieName = process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });

  return response;
}
