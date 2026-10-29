import { ActivateApiClient } from "@/lib/activate-api";

const CACHE_MS = 60 * 60 * 1000;
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;

let cached: { names: string[]; expiresAt: number } | null = null;

/**
 * Player names to suggest when adding someone: our location's top 100 for the
 * year. PlayActivate has no player search, so anyone else is added by typing
 * their exact username. Cached for an hour; an API failure just means no
 * suggestions for a few minutes.
 */
export async function getSuggestedPlayerNames(): Promise<string[]> {
  if (cached && cached.expiresAt > Date.now()) return cached.names;

  const apiClient = new ActivateApiClient();
  try {
    const names = await apiClient.getYearlyLeaderNames();
    cached = { names, expiresAt: Date.now() + CACHE_MS };
  } catch (error) {
    console.error("[player-directory] Couldn't load Activate yearly leaders:", error);
    cached = { names: cached?.names ?? [], expiresAt: Date.now() + RETRY_AFTER_FAILURE_MS };
  } finally {
    await apiClient.close();
  }
  return cached.names;
}
