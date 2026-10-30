"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { lookupActivatePlayer, scrapedFieldsFromLookup } from "@/lib/activate-lookup";
import { getSuggestedPlayerNames } from "@/lib/player-directory";
import { requireUser } from "@/lib/session-helpers";

/** Suggested names for the Add player search, minus everyone already on the site. */
export async function getPlayerSuggestions(): Promise<string[]> {
  const user = await requireUser();
  const [names, existing] = await Promise.all([
    getSuggestedPlayerNames(),
    prisma.user.findMany({
      where: { isTestUser: user.isTestUser, isActive: true, activatePlayerName: { not: null } },
      select: { activatePlayerName: true },
    }),
  ]);
  const taken = new Set(existing.map((row) => row.activatePlayerName!.toLowerCase()));
  return names.filter((name) => !taken.has(name.toLowerCase()));
}

export type AddPlayerResult = { ok: true; name: string } | { ok: false; error: string };

function findByPlayerName(name: string, isTestUser: boolean) {
  return prisma.user.findFirst({
    where: { activatePlayerName: { equals: name, mode: "insensitive" }, isTestUser },
    select: { id: true, isActive: true },
  });
}

/**
 * Add someone to the site by their PlayActivate username, so they show up in
 * the player picker and the hourly sync. They have no login until they sign
 * in with Google and enter the same username, which claims this record.
 */
export async function addPlayer(rawName: string): Promise<AddPlayerResult> {
  const adder = await requireUser();
  const name = rawName.trim();
  if (name.length < 2 || name.length > 40) return { ok: false, error: "Enter their PlayActivate username." };

  if (await findByPlayerName(name, adder.isTestUser)) return { ok: false, error: `${name} is already on the site.` };

  const lookup = await lookupActivatePlayer(name);
  if (!lookup.found || !lookup.activateUsername) {
    if (lookup.error === "Player has no scores at this location") {
      return { ok: false, error: `${lookup.activateUsername ?? name} hasn’t played at our location yet.` };
    }
    if (!lookup.error || lookup.error === "Player not found on playactivate.com") {
      return { ok: false, error: `No PlayActivate player named “${name}”. Check the exact username.` };
    }
    console.error(`[addPlayer] Lookup for "${name}" failed:`, lookup.error);
    return { ok: false, error: "Couldn’t reach PlayActivate. Try again in a minute." };
  }

  const canonicalName = lookup.activateUsername;
  const existing = await findByPlayerName(canonicalName, adder.isTestUser);
  if (existing?.isActive) return { ok: false, error: `${canonicalName} is already on the site.` };

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { isActive: true, ...scrapedFieldsFromLookup(lookup) } });
  } else {
    await prisma.user.create({
      data: {
        activatePlayerName: canonicalName,
        onboardingComplete: true,
        isTestUser: adder.isTestUser,
        ...scrapedFieldsFromLookup(lookup),
      },
    });
  }

  for (const path of ["/", "/players", "/badges", "/levels"]) revalidatePath(path);
  return { ok: true, name: canonicalName };
}

/**
 * Take an added player (one who never signed up) off the site: out of the
 * picker and the sync. Their scores stay in the database, so adding them
 * again brings everything back. Players with their own account can't be removed.
 */
export async function removeAddedPlayer(playerId: string): Promise<{ ok: boolean; error?: string }> {
  const remover = await requireUser();
  const target = await prisma.user.findUnique({ where: { id: playerId }, select: { email: true, isTestUser: true } });
  if (!target || target.isTestUser !== remover.isTestUser) return { ok: false, error: "Player not found." };
  if (target.email !== null) return { ok: false, error: "They have their own account, so they can't be removed here." };

  await prisma.user.update({ where: { id: playerId }, data: { isActive: false } });
  for (const path of ["/", "/players", "/badges", "/levels"]) revalidatePath(path);
  return { ok: true };
}
