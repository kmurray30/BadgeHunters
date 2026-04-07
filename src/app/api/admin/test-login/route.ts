import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { encode } from "next-auth/jwt";

/**
 * Log in as a test user — admin mode only.
 * Creates a JWT session token for the selected test user.
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

  const testUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!testUser || !testUser.isTestUser) {
    return NextResponse.json({ error: "Test user not found" }, { status: 404 });
  }

  // Update last login
  await prisma.user.update({
    where: { id: testUser.id },
    data: { lastLoginAt: new Date() },
  });

  // Create a JWT token for this test user
  const token = await encode({
    token: {
      userId: testUser.id,
      role: testUser.role,
      isTestUser: true,
      onboardingComplete: testUser.onboardingComplete,
      name: testUser.activatePlayerName,
      email: null,
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
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  return response;
}
