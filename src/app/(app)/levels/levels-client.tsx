"use client";

import { useMemo, useState } from "react";
import { CompletionPie } from "@/components/completion-pie";
import { DetailSheet, PlayerStatusList } from "@/components/detail-sheet";
import { PlayerPicker } from "@/components/player-picker";
import { ToggleChip } from "@/components/toggle-chip";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { usePlayerSelection } from "@/hooks/use-player-selection";
import {
  compactScore,
  isTopScore,
  LEVEL_NUMBERS,
  levelKey,
  scoreHeatColor,
  type LevelsData,
  type LevelsGame,
  type LevelsRoom,
} from "@/lib/levels-grid";
import type { RosterPlayer } from "@/lib/roster";

const GRID_COLUMNS = "grid grid-cols-[6.25rem_repeat(10,minmax(0,1fr))] md:grid-cols-[11rem_repeat(10,minmax(0,1fr))]";

interface LevelsClientProps {
  data: LevelsData;
  roster: RosterPlayer[];
  currentUserId: string;
}

type LevelFilter = "none" | "notDoneByMe" | "doneByNone";

interface OpenCell {
  room: LevelsRoom;
  game: LevelsGame;
  level: number;
}

export function LevelsClient({ data, roster, currentUserId }: LevelsClientProps) {
  const { selectedIds, selectedPlayers, toggle, justMe, selectAll } = usePlayerSelection(roster, currentUserId);
  // One filter at a time: picking the other switches to it; tapping the active one clears it.
  const [filter, setFilter] = usePersistedState<LevelFilter>("bh:levels:filter", "none");
  const pickFilter = (next: LevelFilter) => setFilter(filter === next ? "none" : next);
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);

  const singlePlayer = selectedIds.length === 1 ? selectedPlayers[0] : null;
  const scoreOf = (playerId: string, key: string) => data.scoresByPlayer[playerId]?.[key];
  const filtering = filter !== "none";
  const cellMatches = (key: string) =>
    filter === "notDoneByMe" ? !scoreOf(currentUserId, key) : filter === "doneByNone" ? selectedIds.every((id) => !scoreOf(id, key)) : true;

  const totalLevels = data.rooms.reduce((sum, room) => sum + room.games.length * LEVEL_NUMBERS.length, 0);
  const myBeaten = Object.keys(data.scoresByPlayer[currentUserId] ?? {}).length;

  // Rooms and games with at least one level passing the filters.
  const visibleRooms = useMemo(() => {
    if (!filtering) return data.rooms;
    return data.rooms
      .map((room) => ({ ...room, games: room.games.filter((game) => LEVEL_NUMBERS.some((level) => cellMatches(levelKey(game.id, level)))) }))
      .filter((room) => room.games.length > 0);
    // cellMatches only depends on the values listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filtering, filter, selectedIds, currentUserId]);

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Levels</h1>
        <p className="font-display pb-1 text-sm text-muted">
          <span className="text-lg font-bold text-foreground">{myBeaten}</span> / {totalLevels} yours
        </p>
      </div>

      <PlayerPicker roster={roster} selectedIds={selectedIds} onToggle={toggle} onJustMe={justMe} onSelectAll={selectAll} />

      <div className="no-scrollbar -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4">
        <ToggleChip pressed={filter === "notDoneByMe"} onToggle={() => pickFilter("notDoneByMe")}>
          Not done by me
        </ToggleChip>
        <ToggleChip pressed={filter === "doneByNone"} onToggle={() => pickFilter("doneByNone")}>
          Done by none
        </ToggleChip>
      </div>
      <p className="mt-2 text-xs text-muted">
        {singlePlayer
          ? "Color shows how close each score is to the top score. Tap a level for details."
          : "Each slice is a player. Tap a level to see everyone's scores."}
      </p>

      <div className="mt-3 space-y-3">
        {visibleRooms.map((room) => (
          <section key={room.slug} className="panel overflow-hidden">
            <div className={`${GRID_COLUMNS} items-center gap-[3px] border-b border-border bg-card-hover/40 px-2 py-1.5`}>
              <h2 className="font-display truncate pl-1 text-sm font-bold uppercase tracking-wider text-highlight">{room.name}</h2>
              {LEVEL_NUMBERS.map((level) => (
                <span key={level} className="font-display text-center text-[11px] font-semibold text-muted">
                  {level}
                </span>
              ))}
            </div>
            <div className="space-y-[3px] p-2">
              {room.games.map((game) => (
                <div key={game.id} className={`${GRID_COLUMNS} items-center gap-[3px]`}>
                  <span className="truncate pl-1 pr-1 text-[13px] font-medium">{game.name}</span>
                  {LEVEL_NUMBERS.map((level) => {
                    const key = levelKey(game.id, level);
                    const dimmed = !cellMatches(key);
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setOpenCell({ room, game, level })}
                        aria-label={`${game.name} level ${level}`}
                        className={`flex aspect-square items-center justify-center transition active:scale-90 md:aspect-auto md:h-10 ${dimmed ? "opacity-25" : ""}`}
                      >
                        {singlePlayer ? (
                          <ScoreTile level={level} score={scoreOf(singlePlayer.id, key)} topScore={data.topScores[key]} />
                        ) : (
                          <span className="block aspect-square h-full max-w-9">
                            <CompletionPie
                              size="100%"
                              slices={selectedPlayers.map((player) => ({ color: player.color, filled: !!scoreOf(player.id, key) }))}
                            />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        ))}
        {visibleRooms.length === 0 && <div className="panel p-8 text-center text-muted">No levels match these filters.</div>}
      </div>

      {openCell && (
        <DetailSheet
          title={`${openCell.game.name} · Level ${openCell.level}`}
          subtitle={`${openCell.room.name}${
            data.topScores[levelKey(openCell.game.id, openCell.level)]
              ? ` · Top score ${data.topScores[levelKey(openCell.game.id, openCell.level)].toLocaleString()}`
              : ""
          }`}
          onClose={() => setOpenCell(null)}
        >
          <PlayerStatusList
            rows={selectedPlayers.map((player) => {
              const score = scoreOf(player.id, levelKey(openCell.game.id, openCell.level));
              return { player, done: !!score, detail: score ? score.toLocaleString() : undefined };
            })}
          />
        </DetailSheet>
      )}
    </div>
  );
}

function ScoreTile({ level, score, topScore }: { level: number; score?: number; topScore?: number }) {
  const color = scoreHeatColor(level, score, topScore);
  const top = isTopScore(score, topScore);
  return (
    <span
      className="font-display flex h-full w-full items-center justify-center rounded-md text-[11px] font-bold text-black/75"
      style={
        top
          ? { background: "linear-gradient(135deg, var(--accent), var(--highlight))", boxShadow: "0 0 10px rgba(255,62,165,0.6)" }
          : { backgroundColor: color ?? "var(--slot-empty)" }
      }
    >
      {score ? <span className="hidden md:inline">{compactScore(score)}</span> : null}
    </span>
  );
}
