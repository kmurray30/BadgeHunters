import { ALL_RANK_COLORS, getRankColor, type RankColor } from "@/lib/rank";

/**
 * Pie colors spread across the spectrum, ordered so each next color is far
 * from the ones before it: with a handful of players everyone gets a clearly
 * different hue.
 */
export const PLAYER_PALETTE = [
  "#FF4D4D", // red
  "#22D3EE", // cyan
  "#FACC15", // yellow
  "#A855F7", // purple
  "#4ADE80", // green
  "#FB923C", // orange
  "#3B82F6", // blue
  "#F472B6", // pink
  "#A3E635", // lime
  "#2DD4BF", // teal
  "#E2E8F0", // white
  "#B45309", // brown
] as const;

/** Past the palette, step around the hue wheel by the golden angle. */
function overflowColor(index: number): string {
  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue} 75% ${index % 2 === 0 ? 62 : 48}%)`;
}

export interface ColorablePlayer {
  id: string;
  /** Earlier players keep their color, so new sign-ups never recolor anyone. */
  createdAt: Date | string;
}

export function playerRankColor(player: { currentScore: number; rankColor?: string | null }): RankColor {
  const stored = player.rankColor as RankColor | null | undefined;
  return stored && ALL_RANK_COLORS.includes(stored) ? stored : getRankColor(player.currentScore);
}

/**
 * Each player's pie color, handed out from the palette in sign-up order. Based
 * on the whole roster, not the current selection, so a player's color is the
 * same on every page and with any selection.
 */
export function assignPlayerColors(players: ColorablePlayer[]): Map<string, string> {
  const ordered = [...players].sort(
    (playerA, playerB) =>
      new Date(playerA.createdAt).getTime() - new Date(playerB.createdAt).getTime() || playerA.id.localeCompare(playerB.id),
  );
  return new Map(
    ordered.map((player, index) => [player.id, index < PLAYER_PALETTE.length ? PLAYER_PALETTE[index] : overflowColor(index)]),
  );
}
