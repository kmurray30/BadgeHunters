import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  lookupActivatePlayer,
  scrapedFieldsFromLookup,
} from "@/lib/activate-lookup";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { realName, activatePlayerName } = body;

  if (!realName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let resolvedActivateName: string | null = null;
  let scrapedFields: ReturnType<typeof scrapedFieldsFromLookup> = {};

  if (activatePlayerName && typeof activatePlayerName === "string" && activatePlayerName.trim()) {
    const lookup = await lookupActivatePlayer(activatePlayerName.trim());
    if (!lookup.found) {
      return NextResponse.json(
        { error: lookup.error ?? "Player not found on playactivate.com" },
        { status: 404 },
      );
    }
    resolvedActivateName = lookup.activateUsername ?? activatePlayerName.trim();
    scrapedFields = scrapedFieldsFromLookup(lookup);
  }

  // ─── Pending user path: create User + Account from session data ─────────
  if (session.user.pendingOnboarding) {
    const email = session.user.pendingEmail;
    if (!email) {
      return NextResponse.json({ error: "Your session expired. Please refresh the page and sign in again." }, { status: 400 });
    }

    const googleName = session.user.pendingName;
    const googleImage = session.user.pendingImage;
    const pendingAccount = session.user.pendingAccount;

    const isSuperuser = email === process.env.SUPERUSER_EMAIL;

    const userData: Record<string, unknown> = {
      email,
      image: googleImage ?? undefined,
      googleAccountName: googleName ?? undefined,
      role: isSuperuser ? "superuser" : "user",
      onboardingComplete: true,
      isTestUser: false,
      realName: realName.trim(),
      activatePlayerName: resolvedActivateName,
      ...scrapedFields,
    };

    const newUser = await prisma.user.create({
      data: userData as Parameters<typeof prisma.user.create>[0]["data"],
    });

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
    onboardingComplete: true,
    ...scrapedFields,
  };
  if (resolvedActivateName) {
    updateData.activatePlayerName = resolvedActivateName;
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: updateData,
  });

  return NextResponse.json({ success: true });
}
