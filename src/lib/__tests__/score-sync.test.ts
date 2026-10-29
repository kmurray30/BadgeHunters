import { describe, expect, it } from "vitest";
import { activeRoomGameIds } from "../score-sync";

describe("activeRoomGameIds", () => {
  it("keeps catalog games that have a location leaderboard", () => {
    // 1030 is a one-level special mode and 1008 is listed but never scored here;
    // 9999 has scores but isn't in the catalog anymore.
    const roomGames = [{ id: 1003 }, { id: 1030 }, { id: 1008 }, { id: 1002 }];
    const roomScores = [
      { gameId: 1003, levelId: 0, highScore: 5100 },
      { gameId: 1002, levelId: 3, highScore: 9000 },
      { gameId: 1008, levelId: 0, highScore: 0 },
      { gameId: 9999, levelId: 0, highScore: 4000 },
    ];
    expect(activeRoomGameIds(roomGames, roomScores)).toEqual([1003, 1002]);
  });

  it("leaves out hidden games even with a leaderboard", () => {
    expect(activeRoomGameIds([{ id: 1002 }, { id: 1008 }], [
      { gameId: 1002, levelId: 0, highScore: 2132 },
      { gameId: 1008, levelId: 0, highScore: 2069 },
    ])).toEqual([1002]);
  });
});
