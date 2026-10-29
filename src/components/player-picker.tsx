"use client";

import { PlayerSliceIcon } from "@/components/completion-pie";
import type { RosterPlayer } from "@/lib/roster";

interface PlayerPickerProps {
  roster: RosterPlayer[];
  selectedIds: string[];
  onToggle: (playerId: string) => void;
  onJustMe: () => void;
  onSelectAll: () => void;
  /** Pin under the header while scrolling (Badges/Levels); off for inline use. */
  sticky?: boolean;
}

/**
 * Sticky row of player chips under the header. Tapping toggles a player; each
 * selected chip shows that player's wedge of the pie, so the row doubles as the legend.
 */
export function PlayerPicker({ roster, selectedIds, onToggle, onJustMe, onSelectAll, sticky = true }: PlayerPickerProps) {
  const onlyMe = selectedIds.length === 1 && roster.find((player) => player.isMe)?.id === selectedIds[0];
  const everyone = selectedIds.length === roster.length;

  return (
    <div className={sticky ? "sticky top-14 z-40 -mx-4 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur-md" : ""}>
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
              {selected ? (
                <PlayerSliceIcon index={selectedIds.indexOf(player.id)} count={selectedIds.length} color={player.color} size={15} />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full" style={{ boxShadow: `inset 0 0 0 1.5px ${player.color}` }} />
              )}
              <span className={player.hasAccount ? "" : "italic opacity-70"}>{player.name}</span>
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
