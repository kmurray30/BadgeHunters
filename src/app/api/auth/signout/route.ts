import { NextResponse } from "next/server";

/**
 * Custom sign-out that clears both the NextAuth JWT session cookie
 * and the admin_mode cookie. Works for both OAuth and test users.
 */
export async function POST() {
  const response = NextResponse.redirect(new URL("/login", process.env.AUTH_URL || "http://localhost:3000"));

  // Clear the session cookie (dev and prod names)
  response.cookies.set("authjs.session-token", "", { maxAge: 0, path: "/" });
  response.cookies.set("__Secure-authjs.session-token", "", { maxAge: 0, path: "/" });

  // Also clear the callback URL cookie that NextAuth sometimes sets
  response.cookies.set("authjs.callback-url", "", { maxAge: 0, path: "/" });
  response.cookies.set("__Secure-authjs.callback-url", "", { maxAge: 0, path: "/" });

  // Clear CSRF token cookie
  response.cookies.set("authjs.csrf-token", "", { maxAge: 0, path: "/" });
  response.cookies.set("__Host-authjs.csrf-token", "", { maxAge: 0, path: "/" });

  return response;
}

export async function GET() {
  return POST();
}
