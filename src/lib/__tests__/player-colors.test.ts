import { describe, expect, it } from "vitest";
import { assignPlayerColors, PLAYER_PALETTE, playerRankColor } from "../player-colors";

describe("assignPlayerColors", () => {
  it("hands out palette colors in sign-up order", () => {
    const colors = assignPlayerColors([
      { id: "late", createdAt: "2026-03-01" },
      { id: "early", createdAt: "2026-01-01" },
      { id: "middle", createdAt: "2026-02-01" },
    ]);
    expect(colors.get("early")).toBe(PLAYER_PALETTE[0]);
    expect(colors.get("middle")).toBe(PLAYER_PALETTE[1]);
    expect(colors.get("late")).toBe(PLAYER_PALETTE[2]);
  });

  it("keeps everyone distinct past the palette", () => {
    const players = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}`, createdAt: new Date(2026, 0, index + 1) }));
    expect(new Set(assignPlayerColors(players).values()).size).toBe(20);
  });
});

describe("playerRankColor", () => {
  it("prefers the stored rank color over the score band", () => {
    expect(playerRankColor({ currentScore: 0, rankColor: "Red" })).toBe("Red");
    expect(playerRankColor({ currentScore: 250_000, rankColor: "bogus" })).toBe("Green");
  });
});
