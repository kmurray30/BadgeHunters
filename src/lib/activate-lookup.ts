/**
 * Activate user lookup module.
 *
 * Uses puppeteer-core to look up a player on playactivate.com/scores.
 * The site is behind Cloudflare's managed challenge, so a real browser
 * that can execute JS is required.
 *
 * Performance: blocks images/CSS/fonts (we only need text), keeps a warm
 * browser between requests, and closes it after 2 minutes of inactivity.
 * Typical lookup time: ~2s.
 *
 * Environment handling:
 *   - Vercel/Lambda: uses @sparticuz/chromium (compressed Linux binary)
 *   - Local dev:     auto-detects Chrome or uses CHROMIUM_PATH env var
 */

import puppeteer, { type Browser, type Page } from "puppeteer-core";

const DEFAULT_LOCATION_ID = "69";
const DEFAULT_LOCATION_SLUG = "seattle (tukwila)";

const BROWSER_IDLE_TIMEOUT_MS = 120_000;

/** Resource types to block — we only need HTML + JS for data extraction */
const BLOCKED_RESOURCE_TYPES = new Set(["image", "stylesheet", "font", "media"]);

const LOCAL_CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ],
};

export interface ActivateLookupResult {
  found: boolean;
  playerName: string | null;
  score: number | null;
  rank: number | null;
  leaderboardPosition: string | null;
  levelsBeat: string | null;
  coins: number | null;
  error: string | null;
}

const NOT_FOUND_RESULT: Omit<ActivateLookupResult, "playerName" | "error"> = {
  found: false,
  score: null,
  rank: null,
  leaderboardPosition: null,
  levelsBeat: null,
  coins: null,
};

// ─── Warm browser singleton ─────────────────────────────────────────────────

let browserInstance: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await teardownBrowser();
  }, BROWSER_IDLE_TIMEOUT_MS);
}

async function teardownBrowser() {
  if (browserInstance) {
    await browserInstance.close().catch(() => {});
    browserInstance = null;
  }
}

async function getOrLaunchBrowser(): Promise<Browser> {
  if (browserInstance) {
    try {
      await browserInstance.version();
      resetIdleTimer();
      return browserInstance;
    } catch {
      browserInstance = null;
    }
  }

  const executablePath = await getChromiumExecutablePath();
  const launchArgs = await getLaunchArgs();

  browserInstance = await puppeteer.launch({
    args: launchArgs,
    defaultViewport: { width: 1440, height: 900 },
    executablePath,
    headless: true,
  });

  resetIdleTimer();
  return browserInstance;
}

/**
 * Create a new page with resource blocking enabled. Blocks images, CSS,
 * fonts, and media to dramatically speed up page loads — we only need
 * the rendered text content.
 */
async function createLightweightPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  );
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
      request.abort();
    } else {
      request.continue();
    }
  });
  return page;
}

// ─── Environment detection ──────────────────────────────────────────────────

async function getChromiumExecutablePath(): Promise<string> {
  if (process.env.CHROMIUM_PATH) {
    return process.env.CHROMIUM_PATH;
  }

  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
  if (isServerless) {
    const chromium = await import("@sparticuz/chromium");
    return chromium.default.executablePath();
  }

  const { existsSync } = await import("fs");
  const platformPaths = LOCAL_CHROME_PATHS[process.platform] ?? [];
  for (const chromePath of platformPaths) {
    if (existsSync(chromePath)) {
      return chromePath;
    }
  }

  throw new Error(
    `No Chrome/Chromium found. Install Google Chrome or set CHROMIUM_PATH env var. Searched: ${platformPaths.join(", ")}`,
  );
}

async function getLaunchArgs(): Promise<string[]> {
  const isServerless = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL;
  if (isServerless) {
    const chromium = await import("@sparticuz/chromium");
    return chromium.default.args;
  }

  return [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
  ];
}

// ─── Score parsing ──────────────────────────────────────────────────────────

function parseScoreData(bodyText: string): Omit<ActivateLookupResult, "playerName" | "error"> {
  const scoreMatch = bodyText.match(/Current\s*Score:\s*([0-9,]+)/i);
  const score = scoreMatch ? parseInt(scoreMatch[1].replace(/,/g, ""), 10) : null;

  const positionMatch = bodyText.match(/Your\s*Leaderboard\s*Position:\s*#?(\d+)/i);
  const leaderboardPosition = positionMatch ? `#${positionMatch[1]}` : null;

  const levelsMatch = bodyText.match(/Levels\s*Beat:\s*(\d+\/\d+)/i);
  const levelsBeat = levelsMatch ? levelsMatch[1] : null;

  const coinsMatch = bodyText.match(/(\d+)\s*Coins/i);
  const coins = coinsMatch ? parseInt(coinsMatch[1], 10) : null;

  const rankMatch = bodyText.match(/(\d{1,2})\s*Rank\b/i);
  const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;

  return { found: score !== null, score, rank, leaderboardPosition, levelsBeat, coins };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Look up a player on playactivate.com using headless Chromium.
 * Typical response time: ~2s.
 */
export async function lookupActivatePlayer(
  playerName: string,
  locationId: string = DEFAULT_LOCATION_ID,
  locationSlug: string = DEFAULT_LOCATION_SLUG,
): Promise<ActivateLookupResult> {
  const trimmedName = playerName.trim();
  if (!trimmedName) {
    return { ...NOT_FOUND_RESULT, playerName: null, error: "Player name is required" };
  }

  const encodedName = encodeURIComponent(trimmedName);
  const encodedSlug = encodeURIComponent(locationSlug);
  const targetUrl = `https://playactivate.com/scores/${encodedName}/${locationId}/${encodedSlug}/scores`;

  let page: Page | null = null;
  try {
    const browser = await getOrLaunchBrowser();
    page = await createLightweightPage(browser);

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

    // Wait for Cloudflare challenge to resolve
    try {
      await page.waitForFunction(
        `document.title !== "Just a moment..." && !document.title.includes("moment")`,
        { timeout: 15000 },
      );
    } catch {
      return { ...NOT_FOUND_RESULT, playerName: trimmedName, error: "Timed out waiting for Cloudflare challenge to resolve" };
    }

    // Wait for "Current Score" (player found) or timeout (not found)
    try {
      await page.waitForFunction(
        `document.body.innerText.includes("Current Score")`,
        { timeout: 5000 },
      );
    } catch {
      const title = await page.title();
      if (!title.includes("Ranking")) {
        return { ...NOT_FOUND_RESULT, playerName: trimmedName, error: null };
      }
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    const data = parseScoreData(bodyText);

    return {
      ...data,
      playerName: trimmedName,
      error: data.found ? null : "Could not parse score data — player may not exist or page structure changed",
    };
  } catch (launchError) {
    const errorMessage = launchError instanceof Error ? launchError.message : String(launchError);
    await teardownBrowser();
    return { ...NOT_FOUND_RESULT, playerName: trimmedName, error: `Browser lookup failed: ${errorMessage}` };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
