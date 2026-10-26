import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActivateApiClient,
  ActivateApiError,
  findRoomForSlug,
} from "../activate-api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("findRoomForSlug", () => {
  const rooms = [
    { id: 10, name: "Hoops" },
    { id: 12, name: "Mega Grid" },
  ];

  it("matches encoded slugs to API room names case-insensitively", () => {
    expect(findRoomForSlug(rooms, "hoops")?.id).toBe(10);
    expect(findRoomForSlug(rooms, "mega%20grid")?.id).toBe(12);
  });

  it("returns null for unknown rooms", () => {
    expect(findRoomForSlug(rooms, "laser")).toBeNull();
  });
});

describe("ActivateApiClient", () => {
  it("requests the player's record at our location", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        playerRank: 42,
        standing: 7,
        totalScore: 123456,
        scores: [{ gameId: 1, levelId: 0, highScore: 900 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const record = await new ActivateApiClient().getPlayerLocation("Some Player");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://new.playactivate.com/api/player/Some%20Player/location/69",
    );
    expect(record).toMatchObject({
      playerName: "Some Player",
      totalScore: 123456,
      playerRank: 42,
      scores: [{ gameId: 1, levelId: 0, highScore: 900 }],
    });
  });

  it("treats 404 as player not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 404)));
    await expect(new ActivateApiClient().getPlayerLocation("ghost")).resolves.toBeNull();
  });

  it("treats a record without totalScore as not found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ scores: [] })));
    await expect(new ActivateApiClient().getPlayerLocation("ghost")).resolves.toBeNull();
  });

  it("surfaces non-JSON responses as API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } }),
      ),
    );
    await expect(new ActivateApiClient().getRoomHighscores(10)).rejects.toBeInstanceOf(
      ActivateApiError,
    );
  });
});
