import { prisma } from "@/lib/db";

export interface ScoreSyncResult {
  synced: number;
  notFound: number;
  errors: number;
}

/**
 * Score sync via scraping has been removed (puppeteer / @sparticuz/chromium
 * were uninstalled to reduce Vercel bundle size). Scores can be updated
 * manually via the profile edit page or admin tools.
 */
export async function runScoreSync(): Promise<ScoreSyncResult> {
  void prisma; // keep import live in case callers expect DB access
  return { synced: 0, notFound: 0, errors: 0 };
}
