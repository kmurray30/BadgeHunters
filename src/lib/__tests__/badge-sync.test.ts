import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const { mergeBadgeStatuses } = await import("../badge-sync");

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
