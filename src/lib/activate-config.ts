export const ACTIVATE_LOCATION = {
  id: "69",
  slug: "seattle (tukwila)",
} as const;

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

const ACTIVATE_BASE_URL = "https://playactivate.com/scores";

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

/** Main player scores page — includes all level scores in embedded JSON */
export function buildPlayerScoresUrl(username: string): string {
  const encodedName = encodePathSegment(username);
  const encodedSlug = encodePathSegment(ACTIVATE_LOCATION.slug);
  return `${ACTIVATE_BASE_URL}/${encodedName}/${ACTIVATE_LOCATION.id}/${encodedSlug}/scores`;
}

/** Room page — includes roomGames catalog and global top scores for that room */
export function buildRoomScoresUrl(username: string, roomSlug: string): string {
  const encodedName = encodePathSegment(username);
  const encodedSlug = encodePathSegment(ACTIVATE_LOCATION.slug);
  return `${ACTIVATE_BASE_URL}/${encodedName}/${ACTIVATE_LOCATION.id}/${encodedSlug}/${roomSlug}/scores`;
}

/** Decode room slug for display (e.g. mega%20grid → mega grid) */
export function decodeRoomSlug(roomSlug: string): string {
  return decodeURIComponent(roomSlug);
}

/** Room display order follows ACTIVATE_ROOM_SLUGS */
export function roomSlugSortIndex(roomSlug: string): number {
  const index = ACTIVATE_ROOM_SLUGS.indexOf(roomSlug as ActivateRoomSlug);
  return index >= 0 ? index : 999;
}
