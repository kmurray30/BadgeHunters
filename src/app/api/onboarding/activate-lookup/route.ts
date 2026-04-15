import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { lookupActivatePlayer } from "@/lib/activate-lookup";

/**
 * Look up a player on playactivate.com during onboarding.
 * Authenticated (requires a session) but NOT admin-only —
 * new users need this to link their Activate account.
 *
 * GET ?name=shumsby — look up by player name or email
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  // Accept both pending users (no id yet) and fully authenticated users
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchTerm = request.nextUrl.searchParams.get("name");
  if (!searchTerm || searchTerm.trim().length === 0) {
    return NextResponse.json({ error: "name parameter is required" }, { status: 400 });
  }

  const result = await lookupActivatePlayer(searchTerm.trim());
  return NextResponse.json(result);
}
