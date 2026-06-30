import type { Page } from "puppeteer-core";
import {
  buildPlayerScoresUrl,
  buildRoomScoresUrl,
} from "@/lib/activate-config";
import {
  waitForActivateData,
  waitForCloudflare,
} from "@/lib/activate-browser";
import {
  parseOverallStatsFromBody,
  parsePlayerPageScript,
  parseRoomPageScript,
  type ActivatePlayerPageData,
  type ActivateRoomPageData,
} from "@/lib/activate-parser";

async function fetchInlineScriptText(page: Page, targetUrl: string): Promise<string> {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const cloudflareError = await waitForCloudflare(page);
  if (cloudflareError) {
    throw new Error(cloudflareError);
  }

  const hasData = await waitForActivateData(page);
  if (!hasData) {
    throw new Error(`Activate data not found on page: ${targetUrl}`);
  }

  const scriptText = await page.evaluate(() => {
    const inlineScript = Array.from(document.querySelectorAll("script:not([src])")).find(
      (scriptElement) => (scriptElement.textContent || "").includes("playerLocation"),
    );
    return inlineScript?.textContent || "";
  });

  if (!scriptText) {
    throw new Error(`Could not extract inline script from: ${targetUrl}`);
  }

  return scriptText;
}

export async function fetchPlayerPageData(
  page: Page,
  username: string,
): Promise<ActivatePlayerPageData & { bodyText: string; scriptText: string }> {
  const targetUrl = buildPlayerScoresUrl(username);
  const scriptText = await fetchInlineScriptText(page, targetUrl);
  const parsed = parsePlayerPageScript(scriptText);

  if (!parsed) {
    throw new Error(`Failed to parse player data for: ${username}`);
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  return { ...parsed, bodyText, scriptText };
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

export function extractOverallStats(bodyText: string, playerData: ActivatePlayerPageData) {
  const fromBody = parseOverallStatsFromBody(bodyText);
  const playerLocation = playerData.playerLocation;

  return {
    score: fromBody.score ?? playerLocation.totalScore ?? null,
    rank: fromBody.rank ?? playerLocation.playerRank ?? null,
    leaderboardPosition:
      fromBody.leaderboardPosition ??
      (playerLocation.standing != null ? `#${playerLocation.standing}` : null),
    levelsBeat: fromBody.levelsBeat ?? null,
    coins: fromBody.coins ?? null,
  };
}
