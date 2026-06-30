import { describe, expect, it } from "vitest";
import { FIXTURE } from "./fixtures/activate-page-script";
import {
  activateLevelIdToDisplayLevel,
  parseAllGamesFromScript,
  parsePlayerPageScript,
  parseRoomPageScript,
  parseRoomsListFromScript,
} from "../activate-parser";

describe("activate-parser", () => {
  it("parses player page script", () => {
    const result = parsePlayerPageScript(FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.playerLocation.playerName).toBe("TestPlayer");
    expect(result!.playerLocation.scores).toHaveLength(2);
    expect(result!.playerLocation.scores[0].highScore).toBe(1777);
  });

  it("parses room page script with games and global tops", () => {
    const result = parseRoomPageScript(FIXTURE);
    expect(result).not.toBeNull();
    expect(result!.roomInfo?.name).toBe("Hoops");
    expect(result!.roomGames).toHaveLength(2);
    expect(result!.roomGames[0].name).toBe("Simon Says");
    expect(result!.roomScores).toHaveLength(2);
    expect(result!.roomScores[1].highScore).toBe(7681);
  });

  it("maps 0-indexed levelId to display level", () => {
    expect(activateLevelIdToDisplayLevel(0)).toBe(1);
    expect(activateLevelIdToDisplayLevel(9)).toBe(10);
  });

  it("extracts all games and rooms from script payload", () => {
    const games = parseAllGamesFromScript(FIXTURE);
    expect(games.length).toBeGreaterThanOrEqual(2);
    expect(games.some((game) => game.name === "Simon Says")).toBe(true);

    const rooms = parseRoomsListFromScript(FIXTURE);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe("Hoops");
  });
});
