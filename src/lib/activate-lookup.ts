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

import puppeteer, { type Browser, type Page, type ElementHandle } from "puppeteer-core";

const DEFAULT_LOCATION_ID = "69";
const DEFAULT_LOCATION_SLUG = "seattle (tukwila)";

const BROWSER_IDLE_TIMEOUT_MS = 120_000;

/** Resource types to block for the direct-URL path (no SPA interaction needed) */
const BLOCKED_RESOURCE_TYPES_AGGRESSIVE = new Set(["image", "stylesheet", "font", "media"]);
/** Lighter blocking for the form path — CSS must load or the SPA's form
 *  handler breaks and falls back to a plain GET (which doesn't resolve emails). */
const BLOCKED_RESOURCE_TYPES_LIGHT = new Set(["image", "font", "media"]);

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
  /** The search term that was used */
  searchTerm: string | null;
  /** The actual Activate account name (extracted from the results page URL) */
  activateUsername: string | null;
  score: number | null;
  rank: number | null;
  leaderboardPosition: string | null;
  levelsBeat: string | null;
  coins: number | null;
  error: string | null;
}

const NOT_FOUND_RESULT: Omit<ActivateLookupResult, "searchTerm" | "error"> = {
  found: false,
  activateUsername: null,
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
 * Create a new page with resource blocking enabled to speed up page loads.
 * @param blockedTypes Which resource types to block. Use AGGRESSIVE for
 *   direct-URL lookups (no SPA needed), LIGHT for form-based lookups
 *   (SPA JS needs CSS to handle form submissions properly).
 */
async function createLightweightPage(
  browser: Browser,
  blockedTypes: Set<string> = BLOCKED_RESOURCE_TYPES_AGGRESSIVE,
): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  );
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (blockedTypes.has(request.resourceType())) {
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

function parseScoreData(bodyText: string): Omit<ActivateLookupResult, "searchTerm" | "activateUsername" | "error"> {
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

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Wait for Cloudflare's "Just a moment..." interstitial to pass. */
async function waitForCloudflare(page: Page): Promise<string | null> {
  try {
    await page.waitForFunction(
      `document.title !== "Just a moment..." && !document.title.includes("moment")`,
      { timeout: 30000 },
    );
    return null;
  } catch {
    return "Timed out waiting for Cloudflare challenge to resolve";
  }
}

/** Wait for the score text or determine the page didn't load player data. Case-insensitive
 *  because CSS text-transform can make it "CURRENT SCORE" in the rendered innerText. */
async function waitForScoreContent(page: Page, timeoutMs = 5000): Promise<boolean> {
  try {
    await page.waitForFunction(
      `document.body.innerText.toLowerCase().includes("current score")`,
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract username from the final URL and parse score data from the page.
 * Shared by both the direct-URL and form-based lookup paths.
 */
async function extractPlayerData(
  page: Page,
  searchTerm: string,
): Promise<ActivateLookupResult> {
  const finalUrl = page.url();
  let activateUsername: string | null = null;
  const urlUsernameMatch = finalUrl.match(/\/scores\/([^/]+)\//);
  if (urlUsernameMatch) {
    activateUsername = decodeURIComponent(urlUsernameMatch[1]);
  }

  const bodyText = await page.evaluate(() => document.body.innerText);
  const data = parseScoreData(bodyText);

  return {
    ...data,
    searchTerm,
    activateUsername: data.found ? (activateUsername ?? searchTerm) : null,
    error: data.found ? null : "Could not parse score data — player may not exist or page structure changed",
  };
}

// ─── Lookup strategies ──────────────────────────────────────────────────────

/**
 * Fast path: construct the player URL directly and navigate to it.
 * Works for usernames but NOT emails (the server doesn't resolve them
 * from the URL path).
 */
async function lookupByDirectUrl(
  page: Page,
  username: string,
  locationId: string,
  locationSlug: string,
): Promise<ActivateLookupResult> {
  const encodedName = encodeURIComponent(username);
  const encodedSlug = encodeURIComponent(locationSlug);
  const targetUrl = `https://playactivate.com/scores/${encodedName}/${locationId}/${encodedSlug}/scores`;

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

  const cloudflareError = await waitForCloudflare(page);
  if (cloudflareError) {
    return { ...NOT_FOUND_RESULT, searchTerm: username, error: cloudflareError };
  }

  const hasScore = await waitForScoreContent(page);
  if (!hasScore) {
    const title = await page.title();
    if (!title.includes("Ranking")) {
      return { ...NOT_FOUND_RESULT, searchTerm: username, error: null };
    }
  }

  return extractPlayerData(page, username);
}

/**
 * Dismiss the cookie consent banner if present. It overlays the page and
 * will intercept clicks on the search form's submit button.
 */
async function dismissCookieBanner(page: Page): Promise<void> {
  const acceptButton = await page.$(".t-acceptAllButton");
  if (acceptButton) {
    await acceptButton.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/**
 * Email path: load the scores search page, type the email into the form,
 * and submit. The site's own JS resolves the email to a username and either
 * navigates (client-side route) to the player page or shows an inline
 * "Unable to find" message.
 */
async function lookupByFormSearch(
  page: Page,
  email: string,
): Promise<ActivateLookupResult> {
  const scoresPageUrl = "https://playactivate.com/scores";
  await page.goto(scoresPageUrl, { waitUntil: "networkidle2", timeout: 45000 });

  const cloudflareError = await waitForCloudflare(page);
  if (cloudflareError) {
    return { ...NOT_FOUND_RESULT, searchTerm: email, error: cloudflareError };
  }

  await dismissCookieBanner(page);

  const searchInputSelector = 'input[name="player-name or email"]';
  try {
    await page.waitForSelector(searchInputSelector, { timeout: 5000 });
  } catch {
    return { ...NOT_FOUND_RESULT, searchTerm: email, error: "Search input not found on page" };
  }

  await page.type(searchInputSelector, email);

  // Find the "Show my stats" button specifically (avoid cookie-banner buttons)
  const submitButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.find((button) => button.textContent?.includes("Show my stats")) ?? null;
  });
  const submitElement = submitButton.asElement() as ElementHandle<Element> | null;
  if (!submitElement) {
    return { ...NOT_FOUND_RESULT, searchTerm: email, error: "Submit button not found on page" };
  }

  const startUrl = page.url();
  await submitElement.click();

  // The site uses client-side routing (not a full page nav), so we poll
  // for either: the URL changing (player found) or "Unable to find" text.
  const found = await page.waitForFunction(
    `window.location.href !== "${startUrl}" || document.body.innerText.toLowerCase().includes("unable to find")`,
    { timeout: 20000 },
  ).catch(() => null);

  if (!found) {
    return { ...NOT_FOUND_RESULT, searchTerm: email, error: "Timed out waiting for search results" };
  }

  // Check which outcome occurred
  const currentUrl = page.url();
  const bodyTextLower = await page.evaluate(() => document.body.innerText.toLowerCase());

  if (bodyTextLower.includes("unable to find") && currentUrl === startUrl) {
    return { ...NOT_FOUND_RESULT, searchTerm: email, error: null };
  }

  // URL changed — the SPA routed to the player's score page.
  // Wait for score content to fully render after the route transition.
  const hasScore = await waitForScoreContent(page, 8000);
  if (!hasScore) {
    return { ...NOT_FOUND_RESULT, searchTerm: email, error: null };
  }

  return extractPlayerData(page, email);
}

// ─── Public API ─────────────────────────────────────────────────────────────

function isEmailSearch(searchTerm: string): boolean {
  return searchTerm.includes("@");
}

/**
 * Look up a player on playactivate.com using headless Chromium.
 *
 * - Usernames use a fast direct-URL lookup (~2-3s).
 * - Emails use the site's search form so the server can resolve
 *   the email to a username (~4-6s, extra page load).
 */
export async function lookupActivatePlayer(
  playerName: string,
  locationId: string = DEFAULT_LOCATION_ID,
  locationSlug: string = DEFAULT_LOCATION_SLUG,
): Promise<ActivateLookupResult> {
  const trimmedName = playerName.trim();
  if (!trimmedName) {
    return { ...NOT_FOUND_RESULT, searchTerm: null, error: "Player name is required" };
  }

  let page: Page | null = null;
  const isEmail = isEmailSearch(trimmedName);
  try {
    const browser = await getOrLaunchBrowser();
    page = await createLightweightPage(
      browser,
      isEmail ? BLOCKED_RESOURCE_TYPES_LIGHT : BLOCKED_RESOURCE_TYPES_AGGRESSIVE,
    );

    if (isEmail) {
      return await lookupByFormSearch(page, trimmedName);
    }
    return await lookupByDirectUrl(page, trimmedName, locationId, locationSlug);
  } catch (launchError) {
    const errorMessage = launchError instanceof Error ? launchError.message : String(launchError);
    await teardownBrowser();
    return { ...NOT_FOUND_RESULT, searchTerm: trimmedName, error: `Browser lookup failed: ${errorMessage}` };
  } finally {
    if (page) {
      await page.close().catch(() => {});
    }
  }
}
