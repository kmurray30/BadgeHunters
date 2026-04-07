/**
 * Support for contextual back labels when linking into a page from a known origin.
 * The browser history stack drives navigation; `from` only affects fallback URL + label copy.
 */

/** Reject open redirects: only same-origin-style paths (leading slash, no scheme). */
export function parseBackFromQuery(fromParam: string | string[] | undefined): { path: string; label: string } | null {
  const raw = Array.isArray(fromParam) ? fromParam[0] : fromParam;
  if (!raw || typeof raw !== "string") return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }

  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("://")) {
    return null;
  }

  return { path: decoded, label: inferBackLabelFromPath(decoded) };
}

/**
 * Short label for the back affordance, keyed off in-app paths.
 * Extend this map as new areas get contextual links.
 */
export function inferBackLabelFromPath(path: string): string {
  const trimmed = path.split("?")[0] ?? path;
  if (trimmed === "/" || trimmed === "") return "Home";
  if (trimmed === "/badges") return "Badges";
  if (trimmed === "/sessions") return "Sessions";
  if (trimmed === "/players") return "Players";
  if (/^\/sessions\/[^/]+$/.test(trimmed)) return "Session";
  if (/^\/badges\/[^/]+$/.test(trimmed)) return "Badge";
  if (/^\/players\/[^/]+$/.test(trimmed)) return "Player";
  if (trimmed.startsWith("/feedback")) return "Feedback";
  if (trimmed.startsWith("/profile")) return "Profile";
  return "Back";
}
