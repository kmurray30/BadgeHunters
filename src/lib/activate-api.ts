/**
 * Client for the public JSON API behind new.playactivate.com (undocumented; see API.md).
 * Tries plain fetch first; if Cloudflare challenges the server, falls back to
 * calling the same endpoints from inside a real browser page on the site.
 */

import type { Page } from "puppeteer-core";
import { ACTIVATE_LOCATION } from "@/lib/activate-config";
import {
  ActivateBrowserSession,
  createLightweightPage,
  waitForCloudflare,
  withTimeout,
} from "@/lib/activate-browser";
import type {
  ActivateLevelScoreEntry,
  ActivatePlayerLocation,
  ActivateRoomGame,
  ActivateRoomInfo,
} from "@/lib/activate-parser";

export const ACTIVATE_SITE_URL = "https://new.playactivate.com";
export const ACTIVATE_API_BASE_URL = `${ACTIVATE_SITE_URL}/api`;

const API_REQUEST_TIMEOUT_MS = 20_000;
const BROWSER_WARMUP_TIMEOUT_MS = 45_000;

const REQUEST_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${ACTIVATE_SITE_URL}/`,
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export class ActivateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
    this.name = "ActivateApiError";
  }
}

interface RawResponse {
  status: number;
  contentType: string;
  body: string;
  cloudflareChallenge: boolean;
}

export interface ActivatePlayerProfile {
  playerName: string;
  rank?: number;
  stars?: number;
  coins?: number;
}

/** One badge from /player/{name}/badges/{locationId}. */
export interface ActivatePlayerBadge {
  id: number;
  name: string;
  description?: string;
  status: unknown;
}

/** One badge from /location/{id}/badges. */
export interface ActivateLocationBadge {
  /** Slug, e.g. "play25CompetitiveGames" */
  id: string;
  /** Activate's numeric badge id */
  badgeId?: number;
  name: string;
  description?: string;
}

export interface ActivateLocationCatalog {
  rooms: ActivateRoomInfo[];
  games: ActivateRoomGame[];
}

export function buildApiUrl(path: string): string {
  return `${ACTIVATE_API_BASE_URL}${path}`;
}

export function playerLocationPath(playerName: string): string {
  return `/player/${encodeURIComponent(playerName)}/location/${ACTIVATE_LOCATION.id}`;
}

export function playerBadgesPath(
  playerName: string,
  locationId: number | string = ACTIVATE_LOCATION.id,
): string {
  return `/player/${encodeURIComponent(playerName)}/badges/${locationId}`;
}

export function roomHighscoresPath(roomId: number): string {
  return `/location/${ACTIVATE_LOCATION.id}/rooms/${roomId}/highscores`;
}

function isCloudflareChallenge(status: number, contentType: string, headers?: Headers): boolean {
  if (headers?.get("cf-mitigated") === "challenge") return true;
  return (status === 403 || status === 503 || status === 429) && contentType.includes("text/html");
}

export class ActivateApiClient {
  private useBrowser = false;
  private browserPagePromise: Promise<{ session: ActivateBrowserSession; page: Page }> | null =
    null;

  /** GET a JSON endpoint. Returns null on 404. */
  async get<T>(path: string): Promise<T | null> {
    const url = buildApiUrl(path);
    let response = this.useBrowser ? await this.fetchViaBrowser(url) : await this.fetchDirect(url);

    if (!this.useBrowser && response.cloudflareChallenge) {
      console.warn(
        `[activate-api] Cloudflare challenged direct request (${response.status}) for ${url}; switching to browser fetch`,
      );
      this.useBrowser = true;
      response = await this.fetchViaBrowser(url);
    }

    if (response.status === 404) return null;
    if (response.cloudflareChallenge) {
      throw new ActivateApiError(
        `Cloudflare blocked the Activate API request even from the browser (HTTP ${response.status})`,
        response.status,
        url,
      );
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ActivateApiError(
        `Activate API returned HTTP ${response.status}: ${response.body.slice(0, 200)}`,
        response.status,
        url,
      );
    }

    try {
      return JSON.parse(response.body) as T;
    } catch {
      throw new ActivateApiError(
        `Activate API returned non-JSON (${response.contentType || "no content type"}): ${response.body.slice(0, 200)}`,
        response.status,
        url,
      );
    }
  }

  async getLocationCatalog(): Promise<ActivateLocationCatalog> {
    const locationId = ACTIVATE_LOCATION.id;
    const [rooms, games] = await Promise.all([
      this.get<ActivateRoomInfo[]>(`/location/${locationId}/rooms`),
      this.get<ActivateRoomGame[]>(`/location/${locationId}/games`),
    ]);
    if (!rooms || !games) {
      throw new Error(`Activate location ${locationId} not found in the API`);
    }
    return { rooms, games };
  }

  async getRoomHighscores(roomId: number): Promise<ActivateLevelScoreEntry[]> {
    return (await this.get<ActivateLevelScoreEntry[]>(roomHighscoresPath(roomId))) ?? [];
  }

  /** Player's record at our location, or null if the player doesn't exist there. */
  async getPlayerLocation(
    playerName: string,
  ): Promise<(ActivatePlayerLocation & { totalScore: number }) | null> {
    const record = await this.get<Omit<ActivatePlayerLocation, "playerName" | "locationId">>(
      playerLocationPath(playerName),
    );
    if (!record || record.totalScore == null) return null;
    return {
      ...record,
      totalScore: record.totalScore,
      scores: record.scores ?? [],
      playerName,
      locationId: Number(ACTIVATE_LOCATION.id),
    };
  }

  /** Every badge at a location with the player's status, or null if the player isn't found. */
  async getPlayerBadges(
    playerName: string,
    locationId: number | string = ACTIVATE_LOCATION.id,
  ): Promise<ActivatePlayerBadge[] | null> {
    const path = playerBadgesPath(playerName, locationId);
    const badges = await this.get<ActivatePlayerBadge[]>(path);
    if (badges != null && !Array.isArray(badges)) {
      throw new ActivateApiError(
        `Activate badges response is not a list: ${JSON.stringify(badges).slice(0, 200)}`,
        200,
        buildApiUrl(path),
      );
    }
    return badges;
  }

  /** Every badge that can be earned at our location. */
  async getLocationBadges(): Promise<ActivateLocationBadge[]> {
    const path = `/location/${ACTIVATE_LOCATION.id}/badges`;
    const badges = await this.get<ActivateLocationBadge[]>(path);
    if (!Array.isArray(badges)) {
      throw new ActivateApiError(
        `Activate location badges response is not a list: ${JSON.stringify(badges).slice(0, 200)}`,
        200,
        buildApiUrl(path),
      );
    }
    return badges;
  }

  /** Names on our location's leaderboard for the year (its top 100), best first. */
  async getYearlyLeaderNames(): Promise<string[]> {
    const leaders = await this.get<{ playerName?: unknown }[]>(`/location/${ACTIVATE_LOCATION.id}/yearly-leaders`);
    return (leaders ?? [])
      .map((leader) => (typeof leader?.playerName === "string" ? leader.playerName.trim() : ""))
      .filter(Boolean);
  }

  /** Location ids where the player has played, or null if the player isn't found. */
  async getPlayerLocationIds(playerName: string): Promise<number[] | null> {
    const locations = await this.get<number[]>(
      `/player/${encodeURIComponent(playerName)}/locations`,
    );
    return Array.isArray(locations) ? locations.map(Number).filter(Number.isFinite) : null;
  }

  async getPlayerProfile(playerName: string): Promise<ActivatePlayerProfile | null> {
    return this.get<ActivatePlayerProfile>(`/player/${encodeURIComponent(playerName)}`);
  }

  async close(): Promise<void> {
    if (!this.browserPagePromise) return;
    try {
      const { session, page } = await this.browserPagePromise;
      await page.close().catch(() => {});
      await session.close();
    } catch {
      // Browser never came up; nothing to close.
    }
  }

  private async fetchDirect(url: string): Promise<RawResponse> {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(API_REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    return {
      status: response.status,
      contentType,
      body,
      cloudflareChallenge: isCloudflareChallenge(response.status, contentType, response.headers),
    };
  }

  /** One page on the site (past Cloudflare) shared by all browser fetches. */
  private getBrowserPage(): Promise<{ session: ActivateBrowserSession; page: Page }> {
    if (!this.browserPagePromise) {
      this.browserPagePromise = (async () => {
        const session = await ActivateBrowserSession.create();
        const page = await createLightweightPage(session.getBrowser());
        await page.goto(`${ACTIVATE_SITE_URL}/`, {
          waitUntil: "domcontentloaded",
          timeout: BROWSER_WARMUP_TIMEOUT_MS,
        });
        const cloudflareError = await waitForCloudflare(page, BROWSER_WARMUP_TIMEOUT_MS);
        if (cloudflareError) {
          await session.close();
          throw new Error(`${cloudflareError} on ${ACTIVATE_SITE_URL}`);
        }
        return { session, page };
      })();
      // Let a later call retry if warm-up failed.
      this.browserPagePromise.catch(() => {
        this.browserPagePromise = null;
      });
    }
    return this.browserPagePromise;
  }

  private async fetchViaBrowser(url: string): Promise<RawResponse> {
    const { page } = await this.getBrowserPage();
    const result = await withTimeout(
      page.evaluate(async (requestUrl: string) => {
        const response = await fetch(requestUrl, {
          headers: { Accept: "application/json, text/plain, */*" },
          credentials: "include",
        });
        return {
          status: response.status,
          contentType: response.headers.get("content-type") ?? "",
          cfMitigated: response.headers.get("cf-mitigated") ?? "",
          body: await response.text(),
        };
      }, url),
      API_REQUEST_TIMEOUT_MS,
      `Browser fetch ${url}`,
    );
    return {
      status: result.status,
      contentType: result.contentType,
      body: result.body,
      cloudflareChallenge:
        result.cfMitigated === "challenge" ||
        isCloudflareChallenge(result.status, result.contentType),
    };
  }
}

/** Overall stats stored on User, from a player's location record. */
export function extractOverallStats(playerLocation: ActivatePlayerLocation & { totalScore: number }) {
  return {
    score: playerLocation.totalScore,
    rank: playerLocation.playerRank ?? null,
    leaderboardPosition:
      playerLocation.standing != null ? `#${playerLocation.standing}` : null,
    levelsBeat: null as string | null,
    coins: null as number | null,
  };
}

/** Find the API room for one of our room slugs (e.g. "mega%20grid" → "Mega Grid"). */
export function findRoomForSlug(
  rooms: ActivateRoomInfo[],
  roomSlug: string,
): ActivateRoomInfo | null {
  const wanted = decodeURIComponent(roomSlug).toLowerCase().trim();
  return (
    rooms.find((room) => room.name.toLowerCase().trim() === wanted) ??
    rooms.find((room) => room.name.toLowerCase().replace(/\s+/g, "") === wanted.replace(/\s+/g, "")) ??
    null
  );
}

const EARNED_BADGE_STATUSES = new Set([
  "earned",
  "complete",
  "completed",
  "achieved",
  "unlocked",
  "awarded",
  "done",
  "true",
  "yes",
]);
const UNEARNED_BADGE_STATUSES = new Set([
  "",
  "unearned",
  "not_earned",
  "notearned",
  "not earned",
  "incomplete",
  "not_completed",
  "locked",
  "available",
  "in_progress",
  "inprogress",
  "pending",
  "none",
  "false",
  "no",
]);

/**
 * Whether an API badge status means "earned". Returns null for values we don't
 * recognise, so callers can refuse to write completion data they can't trust.
 */
export function parseBadgeEarned(status: unknown): boolean | null {
  if (typeof status === "boolean") return status;
  if (typeof status === "number") return status > 0;
  if (status == null) return false;
  if (typeof status === "string") {
    const normalized = status.trim().toLowerCase();
    if (EARNED_BADGE_STATUSES.has(normalized)) return true;
    if (UNEARNED_BADGE_STATUSES.has(normalized)) return false;
  }
  return null;
}

/** Match key for badge names across our catalog and the API ("2 FAST 2 SEE" ≈ "2 Fast 2 See!"). */
export function normalizeBadgeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // fold accents: "DÉJÀ VU" ≈ "Deja Vu"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
