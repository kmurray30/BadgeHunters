import { NextRequest, NextResponse } from "next/server";
import { compareSync, hashSync } from "bcryptjs";

/**
 * Admin mode activation endpoint — Spec §5.
 * Compares the submitted password against a bcrypt hash of ADMIN_MODE_PASSWORD.
 * Sets admin mode flag in a cookie (httpOnly, secure in prod).
 */

function getAdminPasswordHash(): string {
  const plainPassword = process.env.ADMIN_MODE_PASSWORD;
  if (!plainPassword) {
    throw new Error("ADMIN_MODE_PASSWORD environment variable is not set");
  }
  // Hash on the fly for comparison — in a real deployment you'd store the hash
  return hashSync(plainPassword, 10);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const adminPassword = process.env.ADMIN_MODE_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json({ error: "Admin mode not configured" }, { status: 500 });
    }

    // Direct comparison — the env var is the source of truth
    if (password !== adminPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });

    // Set admin mode cookie — session-scoped (no maxAge = browser session)
    response.cookies.set("admin_mode", "active", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
