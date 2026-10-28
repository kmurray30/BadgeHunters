/**
 * Badge completion from the Activate API. The API is the source of truth for
 * BadgeUserStatus.isCompleted / completedAt; every other field on the row
 * (todo, difficulty, player count, notes) belongs to the player and is never
 * written here.
 */

import { prisma } from "@/lib/db";
import { ACTIVATE_LOCATION } from "@/lib/activate-config";
import {
  normalizeBadgeName,
  parseBadgeEarned,
  type ActivateApiClient,
  type ActivateLocationBadge,
  type ActivatePlayerBadge,
} from "@/lib/activate-api";

/** Below this share of API badges matching our catalog, assume a format change and write nothing. */
const MIN_CATALOG_MATCH_RATIO = 0.5;

/** normalized badge name → our Badge.id */
export type BadgeCatalogIndex = Map<string, string>;

export interface PlayerBadgeSyncOutcome {
  matched: number;
  unmatchedApiNames: string[];
  newlyCompleted: string[];
  uncompleted: string[];
}

export async function loadBadgeCatalogIndex(): Promise<BadgeCatalogIndex> {
  const badges = await prisma.badge.findMany({ select: { id: true, name: true } });
  const index: BadgeCatalogIndex = new Map();
  const collisions = new Set<string>();

  for (const badge of badges) {
    const key = normalizeBadgeName(badge.name);
    if (index.has(key)) collisions.add(key);
    index.set(key, badge.id);
  }
  // Ambiguous names can't be matched safely; leave those badges to their current state.
  for (const key of collisions) index.delete(key);

  return index;
}

/**
 * Badges the API lists for our location that our catalog doesn't have yet.
 * Throws (adding nothing) when most API badges don't match our catalog, since
 * that points to a renamed/changed API rather than a few new badges.
 */
export function findMissingCatalogBadges(
  locationBadges: ActivateLocationBadge[],
  catalog: BadgeCatalogIndex,
): ActivateLocationBadge[] {
  const uniqueByName = new Map<string, ActivateLocationBadge>();
  for (const badge of locationBadges) {
    if (typeof badge?.name !== "string" || !badge.name.trim()) continue;
    const key = normalizeBadgeName(badge.name);
    if (key && !uniqueByName.has(key)) uniqueByName.set(key, badge);
  }
  if (uniqueByName.size === 0) return [];

  const missing = [...uniqueByName].filter(([key]) => !catalog.has(key)).map(([, badge]) => badge);
  const matchedCount = uniqueByName.size - missing.length;
  if (matchedCount < uniqueByName.size * MIN_CATALOG_MATCH_RATIO) {
    throw new Error(
      `Only ${matchedCount} of ${uniqueByName.size} Activate location badges matched our catalog; not adding any. Missing: ${missing.slice(0, 10).map((badge) => badge.name).join(", ")}`,
    );
  }
  return missing;
}

/**
 * Our Badge.id → Activate's numeric badge id, for location badges whose name
 * matches our catalog. A name or id seen twice keeps its first match.
 */
export function matchActivateBadgeIds(
  locationBadges: ActivateLocationBadge[],
  catalog: BadgeCatalogIndex,
): Map<string, number> {
  const matches = new Map<string, number>();
  const usedActivateIds = new Set<number>();
  for (const badge of locationBadges) {
    if (typeof badge?.name !== "string" || !Number.isInteger(badge.badgeId)) continue;
    const ourId = catalog.get(normalizeBadgeName(badge.name));
    const activateId = badge.badgeId as number;
    if (!ourId || matches.has(ourId) || usedActivateIds.has(activateId)) continue;
    matches.set(ourId, activateId);
    usedActivateIds.add(activateId);
  }
  return matches;
}

async function linkActivateBadgeIds(matches: Map<string, number>) {
  const current = await prisma.badge.findMany({ select: { id: true, activateBadgeId: true } });
  const changed = current.filter((badge) => matches.has(badge.id) && matches.get(badge.id) !== badge.activateBadgeId);
  for (const badge of changed) {
    const activateBadgeId = matches.get(badge.id)!;
    await prisma.$transaction([
      // The id is unique; free it if a renamed badge still holds it.
      prisma.badge.updateMany({ where: { activateBadgeId, id: { not: badge.id } }, data: { activateBadgeId: null } }),
      prisma.badge.update({ where: { id: badge.id }, data: { activateBadgeId } }),
    ]);
  }
}

/**
 * Bring our badge catalog in line with the API's list for our location: add
 * badges we lack (API name upper-cased to match the catalog, API description;
 * rooms, games and tags start empty for the superuser to fill in) and record
 * each badge's Activate id, which sets the default badge order. Returns the
 * names added.
 */
export async function addMissingLocationBadges(
  apiClient: ActivateApiClient,
  catalog: BadgeCatalogIndex,
): Promise<string[]> {
  const locationBadges = await apiClient.getLocationBadges();
  const missing = findMissingCatalogBadges(locationBadges, catalog);
  const added: string[] = [];

  if (missing.length > 0) {
    const highest = await prisma.badge.aggregate({ _max: { badgeNumber: true } });
    let nextBadgeNumber = (highest._max.badgeNumber ?? 0) + 1;
    for (const badge of missing) {
      const name = badge.name.trim().toUpperCase();
      await prisma.badge.create({
        data: {
          badgeNumber: nextBadgeNumber,
          name,
          description: badge.description?.trim() ?? "",
        },
      });
      nextBadgeNumber += 1;
      added.push(name);
    }
  }

  const fullCatalog = added.length > 0 ? await loadBadgeCatalogIndex() : catalog;
  await linkActivateBadgeIds(matchActivateBadgeIds(locationBadges, fullCatalog));
  return added;
}

/**
 * Decide earned/not-earned per API badge name across every location the player
 * has visited: a badge earned anywhere counts as earned.
 */
export function mergeBadgeStatuses(badgeLists: ActivatePlayerBadge[][]): Map<string, {
  name: string;
  earned: boolean;
}> {
  const merged = new Map<string, { name: string; earned: boolean }>();
  const unknownStatuses = new Set<string>();

  for (const badges of badgeLists) {
    for (const badge of badges) {
      if (typeof badge?.name !== "string" || !badge.name.trim()) continue;
      const earned = parseBadgeEarned(badge.status);
      if (earned === null) {
        unknownStatuses.add(JSON.stringify(badge.status));
        continue;
      }
      const key = normalizeBadgeName(badge.name);
      const previous = merged.get(key);
      merged.set(key, { name: badge.name, earned: earned || (previous?.earned ?? false) });
    }
  }

  if (unknownStatuses.size > 0) {
    throw new Error(
      `Unrecognised badge status value(s) from the Activate API: ${[...unknownStatuses].join(", ")}. Badge completion left unchanged.`,
    );
  }

  return merged;
}

/**
 * Pull the player's badges from the API and set completion to match. Writes
 * nothing if the response looks wrong (empty, unknown statuses, or mostly
 * names we don't recognise).
 */
export async function syncPlayerBadges(
  apiClient: ActivateApiClient,
  userId: string,
  playerName: string,
  catalog: BadgeCatalogIndex,
): Promise<PlayerBadgeSyncOutcome | null> {
  const locationIds = new Set<number>([Number(ACTIVATE_LOCATION.id)]);
  for (const locationId of (await apiClient.getPlayerLocationIds(playerName)) ?? []) {
    locationIds.add(locationId);
  }

  const badgeLists: ActivatePlayerBadge[][] = [];
  for (const locationId of locationIds) {
    const badges = await apiClient.getPlayerBadges(playerName, locationId);
    if (badges) badgeLists.push(badges);
  }
  if (badgeLists.length === 0) return null;

  const apiStatuses = mergeBadgeStatuses(badgeLists);
  if (apiStatuses.size === 0) {
    throw new Error("Activate API returned no badges. Badge completion left unchanged.");
  }

  const earnedByBadgeId = new Map<string, boolean>();
  const unmatchedApiNames: string[] = [];
  for (const [key, status] of apiStatuses) {
    const badgeId = catalog.get(key);
    if (badgeId) {
      earnedByBadgeId.set(badgeId, status.earned);
    } else {
      unmatchedApiNames.push(status.name);
    }
  }

  if (earnedByBadgeId.size < apiStatuses.size * MIN_CATALOG_MATCH_RATIO) {
    throw new Error(
      `Only ${earnedByBadgeId.size} of ${apiStatuses.size} Activate badges matched our badge catalog by name. Badge completion left unchanged. Unmatched: ${unmatchedApiNames.slice(0, 10).join(", ")}`,
    );
  }

  const existing = await prisma.badgeUserStatus.findMany({
    where: { userId, badgeId: { in: [...earnedByBadgeId.keys()] } },
    select: { badgeId: true, isCompleted: true },
  });
  const completedNow = new Set(
    existing.filter((status) => status.isCompleted).map((status) => status.badgeId),
  );

  const toComplete = [...earnedByBadgeId]
    .filter(([badgeId, earned]) => earned && !completedNow.has(badgeId))
    .map(([badgeId]) => badgeId);
  const toUncomplete = [...earnedByBadgeId]
    .filter(([badgeId, earned]) => !earned && completedNow.has(badgeId))
    .map(([badgeId]) => badgeId);

  if (toComplete.length > 0 || toUncomplete.length > 0) {
    const now = new Date();
    await prisma.$transaction([
      ...toComplete.map((badgeId) =>
        prisma.badgeUserStatus.upsert({
          where: { userId_badgeId: { userId, badgeId } },
          create: { userId, badgeId, isCompleted: true, completedAt: now },
          update: { isCompleted: true, completedAt: now },
        }),
      ),
      prisma.badgeUserStatus.updateMany({
        where: { userId, badgeId: { in: toUncomplete }, isCompleted: true },
        data: { isCompleted: false, completedAt: null },
      }),
    ]);
  }

  const badgeNames = await badgeNamesById([...toComplete, ...toUncomplete]);
  return {
    matched: earnedByBadgeId.size,
    unmatchedApiNames,
    newlyCompleted: toComplete.map((badgeId) => badgeNames.get(badgeId) ?? badgeId),
    uncompleted: toUncomplete.map((badgeId) => badgeNames.get(badgeId) ?? badgeId),
  };
}

async function badgeNamesById(badgeIds: string[]): Promise<Map<string, string>> {
  if (badgeIds.length === 0) return new Map();
  const badges = await prisma.badge.findMany({
    where: { id: { in: badgeIds } },
    select: { id: true, name: true },
  });
  return new Map(badges.map((badge) => [badge.id, badge.name]));
}
