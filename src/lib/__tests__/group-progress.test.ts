import { describe, expect, it } from "vitest";
import { matchesGroupFilters } from "../group-progress";

const selected = ["me", "pat", "jules"];
const doneBy = (ids: string[]) => (playerId: string) => ids.includes(playerId);

describe("matchesGroupFilters", () => {
  it("buckets by how many selected players have done it", () => {
    const filters = (progress: "all" | "nobody" | "some" | "everyone") => ({ progress, notDoneByMe: false });
    expect(matchesGroupFilters(doneBy([]), selected, "me", filters("nobody"))).toBe(true);
    expect(matchesGroupFilters(doneBy(["pat"]), selected, "me", filters("nobody"))).toBe(false);
    expect(matchesGroupFilters(doneBy(["pat"]), selected, "me", filters("some"))).toBe(true);
    expect(matchesGroupFilters(doneBy(selected), selected, "me", filters("some"))).toBe(false);
    expect(matchesGroupFilters(doneBy(selected), selected, "me", filters("everyone"))).toBe(true);
    expect(matchesGroupFilters(doneBy([]), selected, "me", filters("all"))).toBe(true);
  });

  it("ignores players who aren't selected", () => {
    expect(
      matchesGroupFilters(doneBy(["someone-else"]), selected, "me", { progress: "nobody", notDoneByMe: false }),
    ).toBe(true);
  });

  it("hides things the current user already did when asked", () => {
    const filters = { progress: "some" as const, notDoneByMe: true };
    expect(matchesGroupFilters(doneBy(["me"]), selected, "me", filters)).toBe(false);
    expect(matchesGroupFilters(doneBy(["pat"]), selected, "me", filters)).toBe(true);
  });
});
