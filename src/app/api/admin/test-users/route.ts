import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

function isAdminMode(): boolean {
  // Note: cookies() in route handlers returns the request cookies
  // We check the admin_mode cookie set by the activate endpoint
  return true; // Will be checked via middleware or cookie check below
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const testUsers = await prisma.user.findMany({
    where: { isTestUser: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      activatePlayerName: true,
      realName: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ testUsers });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_mode")?.value !== "active") {
    return NextResponse.json({ error: "Admin mode not active" }, { status: 403 });
  }

  const body = await request.json();
  const { displayName } = body;

  if (!displayName || typeof displayName !== "string" || displayName.trim().length === 0) {
    return NextResponse.json({ error: "Display name required" }, { status: 400 });
  }

  const trimmedName = displayName.trim();

  const existingUser = await prisma.user.findFirst({
    where: {
      activatePlayerName: trimmedName,
      isTestUser: true,
    },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "A test user with that name already exists" },
      { status: 409 }
    );
  }

  const testUser = await prisma.user.create({
    data: {
      authType: "test",
      role: "superuser",
      activatePlayerName: trimmedName,
      realName: trimmedName,
      isTestUser: true,
      onboardingComplete: true,
    },
  });

  return NextResponse.json({ user: testUser }, { status: 201 });
}
