import { ALL_RANK_COLORS, getRankColor, RANK_COLOR_HEX, type RankColor } from "@/lib/rank";

/**
 * Shades per rank color, base first, ordered so the first few are the most
 * distinct from each other on a dark background. Players who share a rank
 * color take the next unused shade.
 */
const RANK_COLOR_SHADES: Record<RankColor, string[]> = {
  White: [RANK_COLOR_HEX.White, "#94A3B8", "#FDE68A", "#BAE6FD", "#FBCFE8", "#64748B"],
  Blue: [RANK_COLOR_HEX.Blue, "#93C5FD", "#06B6D4", "#1D4ED8", "#818CF8", "#38BDF8"],
  Green: [RANK_COLOR_HEX.Green, "#BEF264", "#14B8A6", "#15803D", "#86EFAC", "#4D7C0F"],
  Orange: [RANK_COLOR_HEX.Orange, "#FDBA74", "#F59E0B", "#C2410C", "#FCD34D", "#9A3412"],
  Red: [RANK_COLOR_HEX.Red, "#FCA5A5", "#F43F5E", "#991B1B", "#FB7185", "#E11D48"],
  Purple: [RANK_COLOR_HEX.Purple, "#D8B4FE", "#E879F9", "#6D28D9", "#C026D3", "#A78BFA"],
};

export interface ColorablePlayer {
  id: string;
  currentScore: number;
  rankColor?: string | null;
  /** Earlier players keep the base shade, so new sign-ups never recolor anyone. */
  createdAt: Date | string;
}

export function playerRankColor(player: Pick<ColorablePlayer, "currentScore" | "rankColor">): RankColor {
  const stored = player.rankColor as RankColor | null | undefined;
  return stored && ALL_RANK_COLORS.includes(stored) ? stored : getRankColor(player.currentScore);
}

/**
 * Each player's pie color: their rank color, shaded apart from anyone else with
 * the same rank color. Based on the whole roster, not the current selection,
 * so a player's color is the same on every page and with any selection.
 */
export function assignPlayerColors(players: ColorablePlayer[]): Map<string, string> {
  const byRank = new Map<RankColor, ColorablePlayer[]>();
  for (const player of players) {
    const rank = playerRankColor(player);
    const group = byRank.get(rank) ?? [];
    group.push(player);
    byRank.set(rank, group);
  }

  const colors = new Map<string, string>();
  for (const [rank, group] of byRank) {
    const shades = RANK_COLOR_SHADES[rank];
    const ordered = [...group].sort(
      (playerA, playerB) =>
        new Date(playerA.createdAt).getTime() - new Date(playerB.createdAt).getTime() ||
        playerA.id.localeCompare(playerB.id),
    );
    ordered.forEach((player, index) => {
      colors.set(player.id, shades[index % shades.length]);
    });
  }
  return colors;
}
