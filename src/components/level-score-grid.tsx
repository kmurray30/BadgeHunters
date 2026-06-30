"use client";

import { Fragment, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LevelRoomGroup } from "@/lib/levels-grid";
import {
  formatGroupCompletionCellLabel,
  groupCompletionCellBackground,
  groupCompletionTextColor,
  myScoreCellBackground,
  myScoreIsGlobalTop,
} from "@/lib/levels-grid";

export type LevelGridMode = "my-scores" | "group-completion";

interface LevelScoreGridProps {
  mode: LevelGridMode;
  rooms: LevelRoomGroup[];
}

const LEVEL_HEADERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LONG_PRESS_MS = 400;

function MyScoreCell({
  level,
  score,
  topScore,
}: {
  level: number;
  score: number;
  topScore?: number;
}) {
  const cellRef = useRef<HTMLTableCellElement>(null);
  const [showTopScore, setShowTopScore] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  function clearLongPressTimer() {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function revealTopScore() {
    const cell = cellRef.current;
    if (!cell || topScore == null || topScore <= 0) return;

    const rect = cell.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
    setShowTopScore(true);
  }

  function hideTopScore() {
    clearLongPressTimer();
    setShowTopScore(false);
    setTooltipPosition(null);
  }

  function handleTouchStart() {
    if (topScore == null || topScore <= 0) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(revealTopScore, LONG_PRESS_MS);
  }

  const cellBackground = myScoreCellBackground(level, score, topScore);
  const hasTopScore = topScore != null && topScore > 0;
  const isGlobalTop = myScoreIsGlobalTop(score, topScore);

  return (
    <td
      ref={cellRef}
      className={`relative px-1 py-1.5 text-center tabular-nums${isGlobalTop ? " font-bold" : ""}`}
      style={{
        background: cellBackground,
        color: isGlobalTop ? "#ffffff" : "#000000",
      }}
      onMouseEnter={revealTopScore}
      onMouseLeave={hideTopScore}
      onTouchStart={handleTouchStart}
      onTouchEnd={hideTopScore}
      onTouchCancel={hideTopScore}
      onTouchMove={clearLongPressTimer}
    >
      {score.toLocaleString()}
      {showTopScore && hasTopScore && tooltipPosition
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-border bg-card px-2 py-1 text-[10px] font-medium text-foreground shadow-md"
              style={{
                left: tooltipPosition.x,
                top: tooltipPosition.y - 4,
              }}
              role="tooltip"
            >
              Top: {topScore.toLocaleString()}
            </div>,
            document.body,
          )
        : null}
    </td>
  );
}

export function LevelScoreGrid({ mode, rooms }: LevelScoreGridProps) {
  const gameColumnWidth = 140;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] border-collapse text-xs table-fixed">
        <colgroup>
          <col style={{ width: gameColumnWidth }} />
          {LEVEL_HEADERS.map((level) => (
            <col key={level} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border bg-card">
            <th className="sticky left-0 z-10 border-r border-border bg-card px-3 py-2 text-left font-semibold text-muted">
              Game
            </th>
            {LEVEL_HEADERS.map((level) => (
              <th
                key={level}
                className="px-0.5 py-2 text-center font-semibold text-muted"
              >
                {level}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => (
            <Fragment key={room.slug}>
              <tr className="bg-card-hover">
                <td
                  className="sticky left-0 z-10 truncate border-r border-border bg-card-hover px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-foreground"
                  title={room.name}
                >
                  {room.name}
                </td>
                <td
                  colSpan={LEVEL_HEADERS.length}
                  className="bg-card-hover"
                />
              </tr>
              {room.games.map((game) => (
                <tr key={game.id} className="border-t border-border/50">
                  <td
                    className="sticky left-0 z-10 truncate border-r border-border bg-card px-3 py-1.5 font-medium text-foreground"
                    title={game.name}
                  >
                    {game.name}
                  </td>
                  {game.levels.map((cell) => {
                    if (mode === "my-scores") {
                      const score = cell.score ?? 0;
                      return (
                        <MyScoreCell
                          key={cell.level}
                          level={cell.level}
                          score={score}
                          topScore={cell.topScore}
                        />
                      );
                    }

                    const completedCount = cell.completedCount ?? 0;
                    const totalSelected = cell.totalSelected ?? 0;
                    const completedPlayers = cell.completedPlayers ?? [];
                    const backgroundColor = groupCompletionCellBackground(
                      completedCount,
                      totalSelected,
                    );
                    const textColor = groupCompletionTextColor(
                      completedCount,
                      totalSelected,
                    );
                    const cellLabel = formatGroupCompletionCellLabel(
                      completedPlayers,
                      totalSelected,
                    );

                    return (
                      <td
                        key={cell.level}
                        className="px-0.5 py-1.5 text-center text-[10px] leading-tight"
                        style={{ backgroundColor, color: textColor }}
                        title={
                          completedPlayers.length > 0
                            ? completedPlayers.join(", ")
                            : undefined
                        }
                      >
                        {cellLabel}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
