/**
 * Look up a player on playactivate.com and return overall score stats.
 * Uses headless browser — same path as score sync / CLI activate-lookup.
 */

import { withActivateBrowserSession } from "@/lib/activate-browser";
import {
  extractOverallStats,
  fetchPlayerPageData,
} from "@/lib/activate-scraper";
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

  try {
    return await withActivateBrowserSession(async (_browser, page) => {
      const playerData = await fetchPlayerPageData(page, trimmedName);
      const overall = extractOverallStats(playerData);
      const activateUsername =
        playerData.playerLocation.playerName?.trim() || trimmedName;

      if (overall.score === null) {
        return {
          ...NOT_FOUND,
          activateUsername,
          error: "Could not parse score data — player may not exist",
        };
      }

      return {
        found: true,
        activateUsername,
        score: overall.score,
        rank: overall.rank,
        leaderboardPosition: overall.leaderboardPosition,
        levelsBeat: overall.levelsBeat,
        coins: overall.coins,
        error: null,
      };
    });
  } catch (lookupError) {
    const errorMessage =
      lookupError instanceof Error ? lookupError.message : String(lookupError);
    return { ...NOT_FOUND, error: errorMessage };
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
