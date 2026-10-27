"use client";

import type { RosterPlayer } from "@/lib/roster";

interface PlayerPickerProps {
  roster: RosterPlayer[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
  onJustMe: () => void;
  onSelectAll: () => void;
}

/**
 * Sticky row of player chips under the header. Tapping toggles a player; each
 * chip shows the player's pie color, so the row doubles as the legend.
 */
export function PlayerPicker({ roster, selectedIds, onToggle, onJustMe, onSelectAll }: PlayerPickerProps) {
  const onlyMe = selectedIds.length === 1 && roster.find((player) => player.isMe)?.id === selectedIds[0];
  const everyone = selectedIds.length === roster.length;

  return (
    <div className="sticky top-14 z-40 -mx-4 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-1.5">
        {roster.map((player) => {
          const selected = selectedIds.includes(player.id);
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => onToggle(player.id)}
              aria-pressed={selected}
              className="flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition active:scale-95"
              style={
                selected
                  ? {
                      borderColor: player.color,
                      backgroundColor: `color-mix(in srgb, ${player.color} 18%, transparent)`,
                      color: "var(--foreground)",
                      boxShadow: `0 0 12px color-mix(in srgb, ${player.color} 35%, transparent)`,
                    }
                  : { borderColor: "var(--border)", color: "var(--muted)" }
              }
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: selected ? player.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${player.color}` }}
              />
              {player.name}
              {player.isMe && <span className="text-[10px] font-medium text-muted">you</span>}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onJustMe}
          disabled={onlyMe}
          className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:text-foreground disabled:opacity-40"
        >
          Just me
        </button>
        <button
          type="button"
          onClick={onSelectAll}
          disabled={everyone}
          className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:text-foreground disabled:opacity-40"
        >
          All
        </button>
      </div>
    </div>
  );
}
