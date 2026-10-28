import { describe, expect, it } from "vitest";
import type { BadgeCardData } from "../badge-cards";
import { cycleSort, sortBadges } from "../badge-sort";

function badge(name: string, difficulty: BadgeCardData["difficulty"], playerCount: string, doneBy: string[] = []): BadgeCardData {
  return { id: name, number: 0, name, description: "", games: [], isPerVisit: false, doneBy, todoByMe: false, difficulty, playerCount };
}

const badges = [
  badge("A", "hard", "gte_5", ["me"]),
  badge("B", "unknown", "lte_3", ["me", "pat"]),
  badge("C", "easy", "none"),
  badge("D", "easy", "gte_5", ["pat"]),
];
const doneCount = (item: BadgeCardData) => item.doneBy.length;
const names = (list: BadgeCardData[]) => list.map((item) => item.name).join("");

describe("cycleSort", () => {
  it("goes off → asc → desc → off, appending new sorts", () => {
    let sorts = cycleSort([], "difficulty");
    expect(sorts).toEqual([{ key: "difficulty", direction: "asc" }]);
    sorts = cycleSort(sorts, "completion");
    sorts = cycleSort(sorts, "difficulty");
    expect(sorts).toEqual([
      { key: "difficulty", direction: "desc" },
      { key: "completion", direction: "asc" },
    ]);
    expect(cycleSort(sorts, "difficulty")).toEqual([{ key: "completion", direction: "asc" }]);
  });
});

describe("sortBadges", () => {
  it("keeps the incoming order with no sorts", () => {
    expect(names(sortBadges(badges, [], doneCount))).toBe("ABCD");
  });

  it("sorts by completion both ways, ties in incoming order", () => {
    expect(names(sortBadges(badges, [{ key: "completion", direction: "asc" }], doneCount))).toBe("CADB");
    expect(names(sortBadges(badges, [{ key: "completion", direction: "desc" }], doneCount))).toBe("BADC");
  });

  it("puts badges without a difficulty or group size last either way", () => {
    expect(names(sortBadges(badges, [{ key: "difficulty", direction: "asc" }], doneCount))).toBe("CDAB");
    expect(names(sortBadges(badges, [{ key: "difficulty", direction: "desc" }], doneCount))).toBe("ACDB");
    expect(names(sortBadges(badges, [{ key: "groupSize", direction: "desc" }], doneCount))).toBe("ADBC");
  });

  it("uses later sorts to break ties", () => {
    const sorts = [
      { key: "difficulty", direction: "asc" },
      { key: "completion", direction: "desc" },
    ] as const;
    expect(names(sortBadges(badges, [...sorts], doneCount))).toBe("DCAB");
  });
});
