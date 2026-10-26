import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // Vercel's file tracer doesn't follow the brotli binary files inside
  // @sparticuz/chromium (they're not JS imports). This forces them into
  // the deployment bundle for every route that uses Puppeteer.
  outputFileTracingIncludes: {
    "/api/cron/score-sync": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/cron/daily": ["./node_modules/@sparticuz/chromium/**/*"],
    "/api/sync/start": ["./node_modules/@sparticuz/chromium/**/*"],
  },
  // www is the canonical host (Google sign-in is registered for it), so send
  // the bare domain there instead of serving the app on two hosts.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "badgebitches.club" }],
        destination: "https://www.badgebitches.club/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
