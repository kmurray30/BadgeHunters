/**
 * Parse embedded JSON from PlayActivate score pages.
 * Data lives in a large inline <script> tag (Vue/Inertia payload).
 */

export interface ActivateLevelScoreEntry {
  gameId: number;
  levelId: number;
  highScore: number;
}

export interface ActivatePlayerLocation {
  locationId: number;
  playerName: string;
  playerRank: number;
  scores: ActivateLevelScoreEntry[];
  standing?: number;
  totalScore?: number;
  yearlyRank?: number;
  yearlyScore?: number;
}

export interface ActivateRoomGame {
  id: number;
  name: string;
  roomId: number;
  roomIndex: number;
}

export interface ActivateRoomInfo {
  id: number;
  name: string;
}

export interface ActivateRoomPageData {
  playerLocation: ActivatePlayerLocation;
  roomGames: ActivateRoomGame[];
  roomScores: ActivateLevelScoreEntry[];
  roomInfo: ActivateRoomInfo | null;
}

export interface ActivatePlayerPageData {
  playerLocation: ActivatePlayerLocation;
}

function extractJsonValue(source: string, fieldName: string): string | null {
  const needle = `"${fieldName}":`;
  const startIndex = source.indexOf(needle);
  if (startIndex < 0) return null;

  let index = startIndex + needle.length;
  while (index < source.length && /\s/.test(source[index])) {
    index++;
  }

  const firstChar = source[index];
  if (firstChar !== "{" && firstChar !== "[") {
    return null;
  }

  const openChar = firstChar;
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let cursor = index; cursor < source.length; cursor++) {
    const character = source[cursor];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (character === openChar) depth++;
    if (character === closeChar) {
      depth--;
      if (depth === 0) {
        return source.slice(index, cursor + 1);
      }
    }
  }

  return null;
}

function getInlineScriptText(htmlOrScript: string): string {
  if (htmlOrScript.includes("<script")) {
    const scriptMatch = htmlOrScript.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch?.[1]?.includes("playerLocation")) {
      return scriptMatch[1];
    }
    const scripts = [...htmlOrScript.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    for (const match of scripts) {
      if (match[1]?.includes("playerLocation")) {
        return match[1];
      }
    }
  }
  return htmlOrScript;
}

function parsePlayerLocation(scriptText: string): ActivatePlayerLocation | null {
  const jsonFragment = extractJsonValue(scriptText, "playerLocation");
  if (!jsonFragment) return null;

  try {
    const parsed = JSON.parse(jsonFragment) as ActivatePlayerLocation;
    if (!parsed || !Array.isArray(parsed.scores)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ActivateRoomListEntry {
  id: number;
  name: string;
}

/** Scan the full page payload for every game object (all rooms). */
export function parseAllGamesFromScript(scriptText: string): ActivateRoomGame[] {
  const source = getInlineScriptText(scriptText);
  const gamesById = new Map<number, ActivateRoomGame>();
  const pattern =
    /\{"id":(\d+),"name":"([^"]+)"[^}]*"roomId":(\d+)[^}]*"roomIndex":(\d+)/g;

  for (const match of source.matchAll(pattern)) {
    const gameId = Number(match[1]);
    gamesById.set(gameId, {
      id: gameId,
      name: match[2],
      roomId: Number(match[3]),
      roomIndex: Number(match[4]),
    });
  }

  return [...gamesById.values()];
}

export function parseRoomsListFromScript(scriptText: string): ActivateRoomListEntry[] {
  const source = getInlineScriptText(scriptText);
  const roomsJson = extractJsonValue(source, "rooms");
  if (!roomsJson) return [];

  try {
    return JSON.parse(roomsJson) as ActivateRoomListEntry[];
  } catch {
    return [];
  }
}

export function roomNameToSlug(roomName: string): string {
  return encodeURIComponent(roomName.toLowerCase());
}

export function parsePlayerPageScript(scriptText: string): ActivatePlayerPageData | null {
  const source = getInlineScriptText(scriptText);
  const playerLocation = parsePlayerLocation(source);
  if (!playerLocation) return null;
  return { playerLocation };
}

export function parseRoomPageScript(scriptText: string): ActivateRoomPageData | null {
  const source = getInlineScriptText(scriptText);
  const playerLocation = parsePlayerLocation(source);
  if (!playerLocation) return null;

  let roomGames: ActivateRoomGame[] = [];
  let roomScores: ActivateLevelScoreEntry[] = [];
  let roomInfo: ActivateRoomInfo | null = null;

  const roomGamesJson = extractJsonValue(source, "roomGames");
  if (roomGamesJson) {
    try {
      roomGames = JSON.parse(roomGamesJson) as ActivateRoomGame[];
    } catch {
      roomGames = [];
    }
  }

  const roomScoresJson = extractJsonValue(source, "roomScores");
  if (roomScoresJson) {
    try {
      roomScores = JSON.parse(roomScoresJson) as ActivateLevelScoreEntry[];
    } catch {
      roomScores = [];
    }
  }

  const roomInfoJson = extractJsonValue(source, "roomInfo");
  if (roomInfoJson) {
    try {
      roomInfo = JSON.parse(roomInfoJson) as ActivateRoomInfo;
    } catch {
      roomInfo = null;
    }
  }

  return { playerLocation, roomGames, roomScores, roomInfo };
}

/** levelId from Activate is 0-indexed; display levels are 1–10 */
export function activateLevelIdToDisplayLevel(levelId: number): number {
  return levelId + 1;
}

export function parseOverallStatsFromBody(bodyText: string): {
  score: number | null;
  rank: number | null;
  leaderboardPosition: string | null;
  levelsBeat: string | null;
  coins: number | null;
} {
  const scoreMatch = bodyText.match(/Current\s*Score:\s*([0-9,]+)/i);
  const score = scoreMatch ? parseInt(scoreMatch[1].replace(/,/g, ""), 10) : null;

  const positionMatch = bodyText.match(/Your\s*(?:Leaderboard\s*)?Position:\s*#?(\d+)/i);
  const leaderboardPosition = positionMatch ? `#${positionMatch[1]}` : null;

  const levelsMatch = bodyText.match(/Levels\s*Beat:\s*(\d+\/\d+)/i);
  const levelsBeat = levelsMatch ? levelsMatch[1] : null;

  const coinsMatch = bodyText.match(/(\d+)\s*Coins/i);
  const coins = coinsMatch ? parseInt(coinsMatch[1], 10) : null;

  const rankMatch = bodyText.match(/(\d{1,3})\s*Rank\b/i);
  const rank = rankMatch ? parseInt(rankMatch[1], 10) : null;

  return { score, rank, leaderboardPosition, levelsBeat, coins };
}
