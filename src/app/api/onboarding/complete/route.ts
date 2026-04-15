import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { getRankColor } from "@/lib/rank";

export async function POST(request: NextRequest) {
  const session = await auth();

  // Must have a valid session — either pending or fully authenticated
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { realName, activatePlayerName, score, activateRank, leaderboardPosition, levelsBeat, coins } = body;

  if (!realName || !activatePlayerName) {
    return NextResponse.json({ error: "Name and player name are required" }, { status: 400 });
  }

  // ─── Pending user path: create User + Account from JWT data ───────────────
  if (session.user.pendingOnboarding) {
    // Read the raw JWT to get the OAuth account data we stored during sign-in
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

    if (!token?.pendingEmail) {
      return NextResponse.json({ error: "Your session expired. Please refresh the page and try again." }, { status: 400 });
    }

    const email = token.pendingEmail as string;
    const googleName = token.pendingName as string | null | undefined;
    const googleImage = token.pendingImage as string | null | undefined;
    const pendingAccount = token.pendingAccount as {
      type: string;
      provider: string;
      providerAccountId: string;
      access_token?: string | null;
      expires_at?: number | null;
      id_token?: string | null;
      refresh_token?: string | null;
      token_type?: string | null;
      scope?: string | null;
      session_state?: string | null;
    } | null;

    const isSuperuser = email === process.env.SUPERUSER_EMAIL;

    // Build the base user data
    const userData: Record<string, unknown> = {
      email,
      image: googleImage ?? undefined,
      googleAccountName: googleName ?? undefined,
      role: isSuperuser ? "superuser" : "user",
      onboardingComplete: true,
      isTestUser: false,
      realName: realName.trim(),
      activatePlayerName: activatePlayerName.trim(),
    };

    // Add Activate stats if present
    if (typeof score === "number" && score > 0) {
      userData.currentScore = score;
      userData.rankColor = getRankColor(score);
      userData.lastScoreSource = "scrape";
      userData.lastSyncedAt = new Date();
      userData.lastGoodScoreAt = new Date();
    }
    if (typeof activateRank === "number") userData.activateRank = activateRank;
    if (typeof leaderboardPosition === "string") userData.leaderboardPosition = leaderboardPosition;
    if (typeof levelsBeat === "string") userData.levelsBeat = levelsBeat;
    if (typeof coins === "number") userData.coins = coins;

    // Create the User row
    const newUser = await prisma.user.create({
      data: userData as Parameters<typeof prisma.user.create>[0]["data"],
    });

    // Link the Google OAuth account
    if (pendingAccount) {
      await prisma.account.create({
        data: {
          userId: newUser.id,
          type: pendingAccount.type,
          provider: pendingAccount.provider,
          providerAccountId: pendingAccount.providerAccountId,
          access_token: pendingAccount.access_token ?? undefined,
          expires_at: pendingAccount.expires_at ?? undefined,
          id_token: pendingAccount.id_token ?? undefined,
          refresh_token: pendingAccount.refresh_token ?? undefined,
          token_type: pendingAccount.token_type ?? undefined,
          scope: pendingAccount.scope ?? undefined,
          session_state: pendingAccount.session_state ?? undefined,
        },
      });
    }

    return NextResponse.json({ success: true });
  }

  // ─── Returning user path: update existing User row ─────────────────────────
  if (!session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updateData: Record<string, unknown> = {
    realName: realName.trim(),
    activatePlayerName: activatePlayerName.trim(),
    onboardingComplete: true,
  };

  if (typeof score === "number" && score > 0) {
    updateData.currentScore = score;
    updateData.rankColor = getRankColor(score);
    updateData.lastScoreSource = "scrape";
    updateData.lastSyncedAt = new Date();
    updateData.lastGoodScoreAt = new Date();
  }
  if (typeof activateRank === "number") updateData.activateRank = activateRank;
  if (typeof leaderboardPosition === "string") updateData.leaderboardPosition = leaderboardPosition;
  if (typeof levelsBeat === "string") updateData.levelsBeat = levelsBeat;
  if (typeof coins === "number") updateData.coins = coins;

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  });

  return NextResponse.json({ success: true });
}
