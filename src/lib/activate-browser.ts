/**
 * Headless browser lifecycle for PlayActivate scraping.
 * Uses Browserless.io in production or local Chrome in development.
 */

import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { formatSyncError } from "@/lib/sync-error-format";

const BROWSER_IDLE_TIMEOUT_MS = 120_000;
const CLOUDFLARE_WAIT_TIMEOUT_MS = 30_000;
const PAGE_NAVIGATION_TIMEOUT_MS = 30_000;
const PAGE_EVALUATE_TIMEOUT_MS = 15_000;
const FETCH_RETRY_COUNT = 1;
const FETCH_DELAY_MS = 500;
export const FETCH_OPERATION_TIMEOUT_MS = 55_000;
export const PLAYER_STEP_TIMEOUT_MS = 75_000;
export const BROWSER_SHUTDOWN_TIMEOUT_MS = 10_000;

const BLOCKED_RESOURCE_TYPES = new Set(["image", "font", "media"]);

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

function buildBrowserlessEndpoints(): string[] {
  const browserlessToken = process.env.BROWSERLESS_TOKEN!;
  const host = process.env.BROWSERLESS_HOST ?? "production-sfo.browserless.io";
  const endpoints = [
    `wss://${host}/chromium?token=${browserlessToken}`,
    `wss://${host}?token=${browserlessToken}`,
  ];

  if (process.env.BROWSERLESS_USE_STEALTH === "true") {
    endpoints.unshift(`wss://${host}/stealth/chromium?token=${browserlessToken}`);
  }

  return endpoints;
}

async function connectBrowserless(): Promise<Browser> {
  const endpoints = buildBrowserlessEndpoints();
  let lastError: unknown;

  for (const browserWSEndpoint of endpoints) {
    try {
      return await puppeteer.connect({ browserWSEndpoint });
    } catch (error) {
      lastError = error;
      const errorText = formatSyncError(error).toLowerCase();
      const isEndpointMismatch =
        errorText.includes("unexpected server response: 400") ||
        errorText.includes("unexpected server response: 404") ||
        errorText.includes("not found");

      if (!isEndpointMismatch) {
        throw error;
      }
    }
  }

  throw new Error(
    `Browserless connection failed after trying ${endpoints.length} endpoint(s): ${formatSyncError(lastError)}. Check BROWSERLESS_TOKEN and remove invalid query parameters from the connection URL.`,
  );
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
  page.setDefaultTimeout(PAGE_NAVIGATION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PAGE_NAVIGATION_TIMEOUT_MS);
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
      `document.title !== "Just a moment..." &&
       !document.title.includes("moment") &&
       !(document.body?.innerText || "").includes("Verify you are human")`,
      { timeout: CLOUDFLARE_WAIT_TIMEOUT_MS },
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
      { timeout: CLOUDFLARE_WAIT_TIMEOUT_MS },
    );
    return true;
  } catch {
    return false;
  }
}

export function isRecoverableBrowserError(error: unknown): boolean {
  const lowerMessage = formatSyncError(error).toLowerCase();
  return (
    lowerMessage.includes("detached frame") ||
    lowerMessage.includes("target closed") ||
    lowerMessage.includes("session closed") ||
    lowerMessage.includes("protocol error") ||
    lowerMessage.includes("execution context was destroyed") ||
    lowerMessage.includes("timed out waiting for cloudflare") ||
    lowerMessage.includes("navigation timeout") ||
    lowerMessage.includes("timed out after") ||
    lowerMessage.includes("net::err_") ||
    lowerMessage.includes("activate data not found")
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationLabel: string,
  onTimeout?: () => void | Promise<void>,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      void Promise.resolve(onTimeout?.()).finally(() => {
        reject(new Error(`${operationLabel} timed out after ${timeoutMs}ms`));
      });
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (timedOut) {
      // Give abort handlers a moment to run before callers continue.
      await delay(50);
    }
  }
}

export async function evaluatePageWithTimeout<T>(
  page: Page,
  pageFunction: () => T,
  operationLabel: string,
  timeoutMs = PAGE_EVALUATE_TIMEOUT_MS,
): Promise<T> {
  return withTimeout(page.evaluate(pageFunction), timeoutMs, operationLabel);
}

export async function connectBrowserWithTimeout(): Promise<Browser> {
  return withTimeout(getOrLaunchBrowser(), 30_000, "Browser connection");
}

export class ActivateBrowserSession {
  private browser: Browser;
  private page: Page;

  private constructor(browser: Browser, page: Page) {
    this.browser = browser;
    this.page = page;
  }

  static async create(): Promise<ActivateBrowserSession> {
    const browser = await connectBrowserWithTimeout();
    const page = await createLightweightPage(browser);
    return new ActivateBrowserSession(browser, page);
  }

  private async isPageHealthy(): Promise<boolean> {
    if (this.page.isClosed()) return false;
    try {
      await withTimeout(this.page.evaluate(() => true), 5_000, "Page health check");
      return true;
    } catch {
      return false;
    }
  }

  private async recreatePage(): Promise<Page> {
    await this.page.close().catch(() => {});

    try {
      this.page = await createLightweightPage(this.browser);
      return this.page;
    } catch {
      await releaseBrowser(this.browser);
      this.browser = await connectBrowserWithTimeout();
      this.page = await createLightweightPage(this.browser);
      return this.page;
    }
  }

  async forceResetPage(): Promise<void> {
    try {
      await this.page.close().catch(() => {});
      this.page = await createLightweightPage(this.browser);
    } catch (resetError) {
      console.error(
        "[activate-browser] forceResetPage failed:",
        formatSyncError(resetError),
        resetError,
      );
      try {
        await releaseBrowser(this.browser);
        this.browser = await connectBrowserWithTimeout();
        this.page = await createLightweightPage(this.browser);
      } catch (reconnectError) {
        console.error(
          "[activate-browser] forceResetPage reconnect failed:",
          formatSyncError(reconnectError),
          reconnectError,
        );
      }
    }
  }

  async withPage<T>(
    callback: (page: Page) => Promise<T>,
    maxAttempts = FETCH_RETRY_COUNT + 1,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (!(await this.isPageHealthy())) {
        await this.recreatePage();
      }

      try {
        if (attempt > 0) {
          await delay(FETCH_DELAY_MS * attempt);
        }
        const activePage = this.page;
        return await withTimeout(
          callback(activePage),
          FETCH_OPERATION_TIMEOUT_MS,
          "Browser fetch",
          async () => {
            await activePage.close().catch(() => {});
          },
        );
      } catch (error) {
        lastError = error;
        await this.page.close().catch(() => {});
        if (attempt < maxAttempts - 1 && isRecoverableBrowserError(error)) {
          await this.recreatePage();
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(String(lastError ?? "Browser fetch failed"));
  }

  async close(): Promise<void> {
    await withTimeout(
      (async () => {
        await this.page.close().catch(() => {});
        await releaseBrowser(this.browser);
      })(),
      BROWSER_SHUTDOWN_TIMEOUT_MS,
      "Browser shutdown",
    ).catch(() => {
      void releaseBrowser(this.browser);
    });
  }

  getBrowser(): Browser {
    return this.browser;
  }
}

export {
  PAGE_NAVIGATION_TIMEOUT_MS,
  FETCH_DELAY_MS,
  PAGE_EVALUATE_TIMEOUT_MS,
};

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
  const session = await ActivateBrowserSession.create();
  try {
    return await session.withPage((page) =>
      callback(session.getBrowser(), page),
    );
  } finally {
    await session.close();
  }
}
