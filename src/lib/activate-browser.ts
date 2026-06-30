/**
 * Headless browser lifecycle for PlayActivate scraping.
 * Uses Browserless.io in production or local Chrome in development.
 */

import puppeteer, { type Browser, type Page } from "puppeteer-core";

const BROWSER_IDLE_TIMEOUT_MS = 120_000;

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

let localBrowserInstance: Browser | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await teardownBrowser();
  }, BROWSER_IDLE_TIMEOUT_MS);
}

async function teardownBrowser() {
  if (localBrowserInstance) {
    await localBrowserInstance.close().catch(() => {});
    localBrowserInstance = null;
  }
}

export function useBrowserless(): boolean {
  return !!process.env.BROWSERLESS_TOKEN;
}

async function connectBrowserless(): Promise<Browser> {
  const browserlessToken = process.env.BROWSERLESS_TOKEN!;
  return puppeteer.connect({
    browserWSEndpoint: `wss://production-sfo.browserless.io?token=${browserlessToken}`,
  });
}

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

async function launchLocalBrowser(): Promise<Browser> {
  if (localBrowserInstance) {
    try {
      await localBrowserInstance.version();
      resetIdleTimer();
      return localBrowserInstance;
    } catch {
      localBrowserInstance = null;
    }
  }

  const executablePath = await getChromiumExecutablePath();
  const launchArgs = await getLaunchArgs();

  localBrowserInstance = await puppeteer.launch({
    args: launchArgs,
    defaultViewport: { width: 1440, height: 900 },
    executablePath,
    headless: true,
  });

  resetIdleTimer();
  return localBrowserInstance;
}

export async function getOrLaunchBrowser(): Promise<Browser> {
  if (useBrowserless()) {
    return connectBrowserless();
  }
  return launchLocalBrowser();
}

export async function createLightweightPage(browser: Browser): Promise<Page> {
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

export async function waitForCloudflare(page: Page): Promise<string | null> {
  try {
    await page.waitForFunction(
      `document.title !== "Just a moment..." && !document.title.includes("moment")`,
      { timeout: 20000 },
    );
    return null;
  } catch {
    return "Timed out waiting for Cloudflare challenge to resolve";
  }
}

export async function waitForActivateData(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      `Array.from(document.querySelectorAll('script:not([src])')).some(s => (s.textContent || '').includes('playerLocation'))`,
      { timeout: 20000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function releaseBrowser(browser: Browser): Promise<void> {
  if (useBrowserless()) {
    browser.disconnect();
  } else {
    resetIdleTimer();
  }
}

export async function withActivateBrowserSession<T>(
  callback: (browser: Browser, page: Page) => Promise<T>,
): Promise<T> {
  const browser = await getOrLaunchBrowser();
  const page = await createLightweightPage(browser);
  try {
    return await callback(browser, page);
  } finally {
    await page.close().catch(() => {});
    await releaseBrowser(browser);
  }
}
