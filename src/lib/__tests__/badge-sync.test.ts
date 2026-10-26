import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { findMissingCatalogBadges, mergeBadgeStatuses } = await import("../badge-sync");

describe("mergeBadgeStatuses", () => {
  it("counts a badge as earned if any location has it earned", () => {
    const merged = mergeBadgeStatuses([
      [{ id: 1, name: "Hoop Dreams", status: false }],
      [{ id: 1, name: "HOOP DREAMS", status: true }],
    ]);
    expect(merged.get("hoopdreams")).toEqual({ name: "HOOP DREAMS", earned: true });
  });

  it("refuses to decide when a status value is unrecognised", () => {
    expect(() =>
      mergeBadgeStatuses([[{ id: 1, name: "Hoop Dreams", status: "halfway" }]]),
    ).toThrow(/Unrecognised badge status/);
  });
});

describe("findMissingCatalogBadges", () => {
  const catalog = new Map([
    ["deja vu 2.0".replace(/[^a-z0-9]+/g, ""), "b1"],
    ["riddle60", "b2"],
    ["hoopdreams", "b3"],
  ]);

  it("returns API badges our catalog lacks, once each", () => {
    const missing = findMissingCatalogBadges(
      [
        { id: 1, name: "Deja Vu 2.0" },
        { id: 2, name: "Riddle 6.0" },
        { id: 3, name: "Hoop Dreams" },
        { id: 4, name: "Riddle 7.0", description: "Solve it" },
        { id: 5, name: "RIDDLE 7.0" },
      ],
      catalog,
    );
    expect(missing).toEqual([{ id: 4, name: "Riddle 7.0", description: "Solve it" }]);
  });

  it("adds nothing when most API badges are unrecognised", () => {
    expect(() =>
      findMissingCatalogBadges(
        [
          { id: 1, name: "Totally New A" },
          { id: 2, name: "Totally New B" },
          { id: 3, name: "Hoop Dreams" },
        ],
        catalog,
      ),
    ).toThrow(/not adding any/);
  });
});
