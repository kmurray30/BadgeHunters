import type { Page } from "puppeteer-core";
import {
  buildPlayerScoresUrl,
  buildRoomScoresUrl,
} from "@/lib/activate-config";
import {
  describePageState,
  evaluatePageWithTimeout,
  FETCH_PAGE_BUDGET_MS,
  waitForActivateData,
  waitForCloudflare,
} from "@/lib/activate-browser";
import {
  parsePlayerPageScript,
  parseRoomPageScript,
  type ActivatePlayerPageData,
  type ActivateRoomPageData,
} from "@/lib/activate-parser";

/**
 * Navigation and each wait share one deadline, so a slow phase fails with its
 * own message (and what the page showed) instead of an outer step timeout.
 */
async function fetchInlineScriptText(page: Page, targetUrl: string): Promise<string> {
  const startedAtMs = Date.now();
  const deadlineMs = startedAtMs + FETCH_PAGE_BUDGET_MS;
  const remainingMs = () => Math.max(1_000, deadlineMs - Date.now());
  const elapsedSeconds = () => Math.round((Date.now() - startedAtMs) / 1000);

  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(30_000, remainingMs()),
    });
  } catch (navigationError) {
    throw new Error(
      `Navigation failed after ${elapsedSeconds()}s: ${navigationError instanceof Error ? navigationError.message : String(navigationError)} [${await describePageState(page)}]`,
    );
  }

  const cloudflareError = await waitForCloudflare(page, Math.min(35_000, remainingMs()));
  if (cloudflareError) {
    throw new Error(
      `${cloudflareError} after ${elapsedSeconds()}s — PlayActivate's bot check is blocking the browser [${await describePageState(page)}]`,
    );
  }

  const hasData = await waitForActivateData(page, remainingMs());
  const pageTitle = await page.title().catch(() => "");
  if (pageTitle.toLowerCase().includes("not found")) {
    throw new Error(
      `PlayActivate returned "${pageTitle}" for ${targetUrl} — the scores URL format may have changed [${await describePageState(page)}]`,
    );
  }
  if (!hasData) {
    throw new Error(
      `Activate data not found on page after ${elapsedSeconds()}s — page loaded but has no playerLocation script (site layout may have changed) [${await describePageState(page)}]`,
    );
  }

  const scriptText = await evaluatePageWithTimeout(
    page,
    () => {
      const inlineScript = Array.from(
        document.querySelectorAll("script:not([src])"),
      ).find((scriptElement) =>
        (scriptElement.textContent || "").includes("playerLocation"),
      );
      return inlineScript?.textContent || "";
    },
    "Extract Activate inline script",
  );

  if (!scriptText) {
    throw new Error(`Could not extract inline script from: ${targetUrl}`);
  }

  return scriptText;
}

export async function fetchPlayerPageData(
  page: Page,
  username: string,
): Promise<ActivatePlayerPageData & { scriptText: string }> {
  const targetUrl = buildPlayerScoresUrl(username);
  const scriptText = await fetchInlineScriptText(page, targetUrl);
  const parsed = parsePlayerPageScript(scriptText);

  if (!parsed) {
    throw new Error(`Failed to parse player data for: ${username}`);
  }

  return { ...parsed, scriptText };
}

export async function fetchRoomPageData(
  page: Page,
  username: string,
  roomSlug: string,
): Promise<ActivateRoomPageData> {
  const targetUrl = buildRoomScoresUrl(username, roomSlug);
  const scriptText = await fetchInlineScriptText(page, targetUrl);
  const parsed = parseRoomPageScript(scriptText);

  if (!parsed) {
    throw new Error(`Failed to parse room data for: ${roomSlug}`);
  }

  return parsed;
}

export function extractOverallStats(playerData: ActivatePlayerPageData) {
  const playerLocation = playerData.playerLocation;

  return {
    score: playerLocation.totalScore ?? null,
    rank: playerLocation.playerRank ?? null,
    leaderboardPosition:
      playerLocation.standing != null ? `#${playerLocation.standing}` : null,
    levelsBeat: null,
    coins: null,
  };
}
