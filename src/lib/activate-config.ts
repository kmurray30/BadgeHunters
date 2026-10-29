export const ACTIVATE_LOCATION = {
  id: "69",
  slug: "seattle (tukwila)",
} as const;

/**
 * Games PlayActivate lists and scores at Tukwila that we leave off anyway.
 * 1008 "Trivia": a near-copy of "Trivial" (1002) in Hoops that none of us has
 * played; it showed up as an extra, never-done row.
 */
export const HIDDEN_GAME_IDS: readonly number[] = [1008];

/** URL path segments for each Activate room at Tukwila */
export const ACTIVATE_ROOM_SLUGS = [
  "hoops",
  "grid",
  "hide",
  "mega%20grid",
  "mega%20laser",
  "control",
  "strike",
  "portals",
  "press",
  "scan",
  "laser",
] as const;

export type ActivateRoomSlug = (typeof ACTIVATE_ROOM_SLUGS)[number];

/** Decode room slug for display (e.g. mega%20grid → mega grid) */
export function decodeRoomSlug(roomSlug: string): string {
  return decodeURIComponent(roomSlug);
}

/** Room display order follows ACTIVATE_ROOM_SLUGS */
export function roomSlugSortIndex(roomSlug: string): number {
  const index = ACTIVATE_ROOM_SLUGS.indexOf(roomSlug as ActivateRoomSlug);
  return index >= 0 ? index : 999;
}
