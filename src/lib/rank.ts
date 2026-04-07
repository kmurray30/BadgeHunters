/**
 * Rank color mapping from Spec §6.
 * Each 100k band corresponds to one color.
 */

export type RankColor = "White" | "Blue" | "Green" | "Orange" | "Red" | "Purple";

const RANK_THRESHOLDS: { min: number; color: RankColor }[] = [
  { min: 500_000, color: "Purple" },
  { min: 400_000, color: "Red" },
  { min: 300_000, color: "Orange" },
  { min: 200_000, color: "Green" },
  { min: 100_000, color: "Blue" },
  { min: 0, color: "White" },
];

export function getRankColor(score: number): RankColor {
  for (const threshold of RANK_THRESHOLDS) {
    if (score >= threshold.min) {
      return threshold.color;
    }
  }
  return "White";
}

export const RANK_COLOR_HEX: Record<RankColor, string> = {
  White: "#E5E7EB",
  Blue: "#3B82F6",
  Green: "#22C55E",
  Orange: "#F97316",
  Red: "#EF4444",
  Purple: "#A855F7",
};

export const ALL_RANK_COLORS: RankColor[] = ["White", "Blue", "Green", "Orange", "Red", "Purple"];
