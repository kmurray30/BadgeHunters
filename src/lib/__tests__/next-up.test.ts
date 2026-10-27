import { describe, expect, it } from "vitest";
import type { BadgeCardData } from "../badge-cards";
import { badgesMostNeeded, levelsMostNeeded } from "../next-up";
import type { LevelsData } from "../levels-grid";

function badge(name: string, doneBy: string[], difficulty: BadgeCardData["difficulty"] = "unknown"): BadgeCardData {
  return { id: name, number: 0, name, description: "", games: [], isPerVisit: false, doneBy, todoByMe: false, difficulty, playerCount: "none" };
}

describe("badgesMostNeeded", () => {
  it("ranks by how many selected players still need it, easiest first, and drops finished ones", () => {
    const result = badgesMostNeeded(
      [badge("DONE", ["a", "b"]), badge("HALF", ["a"]), badge("HARD NONE", [], "hard"), badge("EASY NONE", [], "easy")],
      ["a", "b"],
      5,
    );
    expect(result.map((entry) => entry.badge.name)).toEqual(["EASY NONE", "HARD NONE", "HALF"]);
    expect(result[0].needCount).toBe(2);
  });
});

describe("levelsMostNeeded", () => {
  it("prefers levels more players need, then lower levels", () => {
    const data: LevelsData = {
      rooms: [{ slug: "hoops", name: "Hoops", games: [{ id: 1, name: "Barrage" }] }],
      topScores: {},
      scoresByPlayer: {
        a: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((level) => [`1:${level}`, 1000])),
        b: { "1:1": 1000 },
      },
    };
    const result = levelsMostNeeded(data, ["a", "b"], 3);
    expect(result.map((target) => [target.level, target.needCount])).toEqual([
      [9, 2],
      [10, 2],
      [2, 1],
    ]);
  });
});
