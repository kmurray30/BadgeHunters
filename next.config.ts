import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Vercel's file tracer doesn't follow the brotli binary files inside
  // @sparticuz/chromium (they're not JS imports). This forces them into
  // the deployment bundle for every route that uses Puppeteer.
  outputFileTracingIncludes: {
    "/api/onboarding/activate-lookup": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/admin/activate-lookup": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/cron/score-sync": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/cron/daily": ["./node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
