import { describe, expect, it } from "vitest";
import { gamesMostNeeded } from "../next-up";
import type { LevelsData } from "../levels-grid";

const beaten = (gameId: number, levels: number[]) => Object.fromEntries(levels.map((level) => [`${gameId}:${level}`, 1000 * level + 1]));
const allLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("gamesMostNeeded", () => {
  const data: LevelsData = {
    rooms: [
      { slug: "hoops", name: "Hoops", games: [{ id: 1, name: "Barrage" }, { id: 2, name: "Trivial" }] },
      { slug: "grid", name: "Grid", games: [{ id: 3, name: "Zones" }, { id: 4, name: "Strategy" }] },
    ],
    topScores: {},
    scoresByPlayer: {
      a: { ...beaten(1, allLevels), ...beaten(2, [1, 2, 3, 4, 5, 6, 7, 8]), ...beaten(3, [1, 2, 3]), ...beaten(4, [1, 2, 3]) },
      b: { ...beaten(1, allLevels), ...beaten(2, [1, 2]), ...beaten(3, [1, 2, 3, 4, 5, 6, 7]), ...beaten(4, [1, 2, 3]) },
    },
  };

  it("ranks games by level beats the group still needs and lists their open levels", () => {
    const result = gamesMostNeeded(data, ["a", "b"], 5);
    // Strategy: 7+7 missing; Zones: 7+3; Trivial: 2+8. Barrage is finished.
    expect(result.map((target) => [target.game.name, target.needTotal])).toEqual([
      ["Strategy", 14],
      ["Zones", 10],
      ["Trivial", 10],
    ]);
    expect(result[1].openLevels.map((open) => [open.level, open.needCount])).toEqual([
      [4, 1], [5, 1], [6, 1], [7, 1], [8, 2], [9, 2], [10, 2],
    ]);
  });

  it("breaks ties by levels nobody has beaten", () => {
    // Zones and Trivial both need 10; Zones has 3 levels neither has beaten, Trivial 2.
    const result = gamesMostNeeded(data, ["a", "b"], 5);
    expect(result[1].neededByAll).toBe(3);
    expect(result[2].neededByAll).toBe(2);
  });

  it("works for one player", () => {
    expect(gamesMostNeeded(data, ["b"], 1).map((target) => target.game.name)).toEqual(["Trivial"]);
  });
});
