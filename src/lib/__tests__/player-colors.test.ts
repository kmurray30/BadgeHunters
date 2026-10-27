import { describe, expect, it } from "vitest";
import { assignPlayerColors, playerRankColor } from "../player-colors";
import { RANK_COLOR_HEX } from "../rank";

describe("assignPlayerColors", () => {
  it("uses the rank color when nobody shares it", () => {
    const colors = assignPlayerColors([
      { id: "a", currentScore: 650_000, createdAt: "2026-01-01" },
      { id: "b", currentScore: 150_000, createdAt: "2026-01-02" },
    ]);
    expect(colors.get("a")).toBe(RANK_COLOR_HEX.Purple);
    expect(colors.get("b")).toBe(RANK_COLOR_HEX.Blue);
  });

  it("gives players with the same rank color distinct shades, earliest keeps the base", () => {
    const colors = assignPlayerColors([
      { id: "late", currentScore: 700_000, createdAt: "2026-03-01" },
      { id: "early", currentScore: 600_000, createdAt: "2026-01-01" },
      { id: "middle", currentScore: 900_000, createdAt: "2026-02-01" },
    ]);
    expect(colors.get("early")).toBe(RANK_COLOR_HEX.Purple);
    expect(new Set(colors.values()).size).toBe(3);
  });

  it("prefers the stored rank color over the score band", () => {
    expect(playerRankColor({ currentScore: 0, rankColor: "Red" })).toBe("Red");
    expect(playerRankColor({ currentScore: 250_000, rankColor: "bogus" })).toBe("Green");
  });
});
