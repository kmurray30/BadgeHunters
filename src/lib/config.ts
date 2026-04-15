/**
 * Global site configuration.
 * Update SITE_NAME here and it will reflect everywhere on the site.
 */
export const SITE_NAME = "Badge Bitches";

/** Short tagline shown on the login and landing pages */
export const SITE_TAGLINE = "Track badges, plan sessions, hunt together.";

/**
 * Whether to enable automatic email-based lookup on playactivate.com
 * during onboarding. When false, onboarding skips straight to the
 * manual username search and hides email-related UI text.
 *
 * Disabled because Cloudflare blocks the email form-search path from
 * serverless/datacenter IPs. Can be re-enabled once a reliable browser
 * proxy (e.g. Browserless) is confirmed working.
 */
export const ENABLE_EMAIL_LOOKUP = false;
