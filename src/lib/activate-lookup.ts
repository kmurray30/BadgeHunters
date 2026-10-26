/**
 * Look up a player on playactivate.com and return overall score stats.
 * Uses the Activate JSON API — same path as score sync / CLI activate-lookup.
 */

import { ActivateApiClient, extractOverallStats } from "@/lib/activate-api";
import { getRankColor } from "@/lib/rank";
import type { ScoreSource } from "@prisma/client";

export interface ActivateLookupResult {
  found: boolean;
  /** Canonical Activate username from the scores page */
  activateUsername: string | null;
  score: number | null;
  rank: number | null;
  leaderboardPosition: string | null;
  levelsBeat: string | null;
  coins: number | null;
  error: string | null;
}

const NOT_FOUND: ActivateLookupResult = {
  found: false,
  activateUsername: null,
  score: null,
  rank: null,
  leaderboardPosition: null,
  levelsBeat: null,
  coins: null,
  error: null,
};

export async function lookupActivatePlayer(
  playerName: string,
): Promise<ActivateLookupResult> {
  const trimmedName = playerName.trim();
  if (!trimmedName) {
    return { ...NOT_FOUND, error: "Player name is required" };
  }

  const apiClient = new ActivateApiClient();
  try {
    const profile = await apiClient.getPlayerProfile(trimmedName);
    const activateUsername = profile?.playerName?.trim() || trimmedName;
    const playerLocation = await apiClient.getPlayerLocation(activateUsername);

    if (!playerLocation) {
      return {
        ...NOT_FOUND,
        activateUsername: profile ? activateUsername : null,
        error: profile
          ? "Player has no scores at this location"
          : "Player not found on playactivate.com",
      };
    }

    const overall = extractOverallStats(playerLocation);
    return {
      found: true,
      activateUsername,
      score: overall.score,
      rank: overall.rank,
      leaderboardPosition: overall.leaderboardPosition,
      levelsBeat: overall.levelsBeat,
      coins: profile?.coins ?? null,
      error: null,
    };
  } catch (lookupError) {
    const errorMessage =
      lookupError instanceof Error ? lookupError.message : String(lookupError);
    return { ...NOT_FOUND, error: errorMessage };
  } finally {
    await apiClient.close();
  }
}

/** Prisma user fields populated from a successful Activate lookup */
export function scrapedFieldsFromLookup(lookup: ActivateLookupResult): {
  currentScore?: number;
  rankColor?: string;
  activateRank?: number;
  leaderboardPosition?: string;
  levelsBeat?: string;
  coins?: number;
  lastScoreSource?: ScoreSource;
  lastSyncedAt?: Date;
  lastGoodScoreAt?: Date;
} {
  if (!lookup.found || lookup.score === null) {
    return {};
  }

  const fields: ReturnType<typeof scrapedFieldsFromLookup> = {
    currentScore: lookup.score,
    rankColor: getRankColor(lookup.score),
    lastScoreSource: "scrape",
    lastSyncedAt: new Date(),
    lastGoodScoreAt: new Date(),
  };

  if (lookup.rank != null) fields.activateRank = lookup.rank;
  if (lookup.leaderboardPosition) fields.leaderboardPosition = lookup.leaderboardPosition;
  if (lookup.levelsBeat) fields.levelsBeat = lookup.levelsBeat;
  if (lookup.coins != null) fields.coins = lookup.coins;

  return fields;
}
