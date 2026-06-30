import type { Page } from "puppeteer-core";
import {
  buildPlayerScoresUrl,
  buildRoomScoresUrl,
} from "@/lib/activate-config";
import {
  evaluatePageWithTimeout,
  PAGE_NAVIGATION_TIMEOUT_MS,
  waitForActivateData,
  waitForCloudflare,
} from "@/lib/activate-browser";
import {
  parsePlayerPageScript,
  parseRoomPageScript,
  type ActivatePlayerPageData,
  type ActivateRoomPageData,
} from "@/lib/activate-parser";

async function fetchInlineScriptText(page: Page, targetUrl: string): Promise<string> {
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: PAGE_NAVIGATION_TIMEOUT_MS,
  });

  const cloudflareError = await waitForCloudflare(page);
  if (cloudflareError) {
    throw new Error(cloudflareError);
  }

  const hasData = await waitForActivateData(page);
  if (!hasData) {
    throw new Error(`Activate data not found on page: ${targetUrl}`);
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
