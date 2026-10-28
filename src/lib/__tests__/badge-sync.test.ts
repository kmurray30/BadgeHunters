import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { findMissingCatalogBadges, matchActivateBadgeIds, mergeBadgeStatuses } = await import("../badge-sync");

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
        { id: "b1", name: "Deja Vu 2.0" },
        { id: "b2", name: "Riddle 6.0" },
        { id: "b3", name: "Hoop Dreams" },
        { id: "b4", name: "Riddle 7.0", description: "Solve it" },
        { id: "b5", name: "RIDDLE 7.0" },
      ],
      catalog,
    );
    expect(missing).toEqual([{ id: "b4", name: "Riddle 7.0", description: "Solve it" }]);
  });

  it("adds nothing when most API badges are unrecognised", () => {
    expect(() =>
      findMissingCatalogBadges(
        [
          { id: "b1", name: "Totally New A" },
          { id: "b2", name: "Totally New B" },
          { id: "b3", name: "Hoop Dreams" },
        ],
        catalog,
      ),
    ).toThrow(/not adding any/);
  });
});

describe("matchActivateBadgeIds", () => {
  it("pairs our badges with Activate ids by name, skipping unknowns and repeats", () => {
    const catalog = new Map([
      ["2fastto2see", "ours-a"],
      ["dejavu", "ours-b"],
    ]);
    const matches = matchActivateBadgeIds(
      [
        { id: "2Fast2SeeNumbers", badgeId: 2, name: "2 Fast to 2 See" },
        { id: "winSameLevel1TwiceInARow", badgeId: 114, name: "Déjà Vu" },
        { id: "dup", badgeId: 999, name: "DEJA VU" },
        { id: "new", badgeId: 7, name: "Brand New" },
        { id: "noId", name: "2 Fast to 2 See" },
      ],
      catalog,
    );
    expect([...matches]).toEqual([
      ["ours-a", 2],
      ["ours-b", 114],
    ]);
  });
});
