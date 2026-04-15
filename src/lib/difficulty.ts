import type { Difficulty } from "@prisma/client";

/**
 * Difficulty display and averaging logic from Spec §8 and §10.
 */

const DIFFICULTY_NUMERIC: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  impossible: 4,
};

const NUMERIC_TO_DIFFICULTY: Record<number, Difficulty> = {
  1: "easy",
  2: "medium",
  3: "hard",
  4: "impossible",
};

export function difficultyLabel(difficulty: Difficulty | null | undefined): string {
  if (!difficulty || difficulty === "unknown") return "???";
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

/**
 * Compute the community average difficulty from user votes only.
 * Returns null if no valid votes exist.
 */
export function computeAverageDifficulty(
  userVotes: (Difficulty | null)[],
): Difficulty | null {
  const numericVotes: number[] = [];

  for (const vote of userVotes) {
    if (vote && vote !== "unknown" && DIFFICULTY_NUMERIC[vote] !== undefined) {
      numericVotes.push(DIFFICULTY_NUMERIC[vote]);
    }
  }

  if (numericVotes.length === 0) return null;

  const mean = numericVotes.reduce((sum, value) => sum + value, 0) / numericVotes.length;
  const rounded = Math.round(mean);
  const clamped = Math.max(1, Math.min(4, rounded));
  return NUMERIC_TO_DIFFICULTY[clamped];
}

/**
 * Get displayed difficulty for a badge.
 * Personal vote wins; falls back to community average; returns "unknown" if no data.
 */
export function getDisplayedDifficulty(
  personalDifficulty: Difficulty | null | undefined,
  communityVotes: (Difficulty | null)[],
): Difficulty {
  if (personalDifficulty && personalDifficulty !== "unknown") {
    return personalDifficulty;
  }

  const communityAverage = computeAverageDifficulty(communityVotes);
  if (communityAverage) {
    return communityAverage;
  }

  return "unknown";
}

/** Sort order for difficulty ascending — unknown always last */
export function difficultySortKey(difficulty: Difficulty | null | undefined): number {
  if (!difficulty || difficulty === "unknown") return 99;
  return DIFFICULTY_NUMERIC[difficulty] ?? 99;
}
