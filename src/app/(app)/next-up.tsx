"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CompletionPie } from "@/components/completion-pie";
import { PlayerPicker } from "@/components/player-picker";
import { usePlayerSelection } from "@/hooks/use-player-selection";
import type { LevelsData } from "@/lib/levels-grid";
import { gamesMostNeeded } from "@/lib/next-up";
import type { RosterPlayer } from "@/lib/roster";

const GAMES_SHOWN = 5;

interface NextUpProps {
  roster: RosterPlayer[];
  currentUserId: string;
  levels: LevelsData;
}

/** Games where the selected players have the most levels left: good targets for the next visit. */
export function NextUp({ roster, currentUserId, levels }: NextUpProps) {
  const { selectedIds, selectedPlayers, toggle, justMe, selectAll } = usePlayerSelection(roster, currentUserId);
  const targets = useMemo(() => gamesMostNeeded(levels, selectedIds, GAMES_SHOWN), [levels, selectedIds]);
  const group = selectedIds.length > 1;

  return (
    <section className="panel mt-6 p-4">
      <h2 className="font-display text-lg font-bold uppercase tracking-wider">Next up</h2>
      <p className="mb-3 text-xs text-muted">
        {group
          ? "Games where the selected players have the most levels left to beat, counting each player's."
          : "Games where you have the most levels left to beat."}
      </p>
      <PlayerPicker roster={roster} selectedIds={selectedIds} onToggle={toggle} onJustMe={justMe} onSelectAll={selectAll} sticky={false} />

      <ol className="mt-4 space-y-2">
        {targets.map((target, index) => (
          <li key={target.game.id}>
            <Link href="/levels" prefetch={false} className="block rounded-xl bg-background/60 px-3 py-2.5 transition hover:bg-card-hover">
              <div className="flex items-baseline gap-2">
                <span className="font-display w-4 shrink-0 text-sm font-bold text-muted">{index + 1}</span>
                <span className="font-display min-w-0 flex-1 truncate font-bold uppercase">
                  {target.game.name}
                  <span className="ml-2 text-xs font-medium normal-case text-muted">{target.room.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {group ? `${target.needTotal} beats to go` : `${target.openLevels.length} left`}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                {target.openLevels.map((open) => (
                  <span
                    key={open.level}
                    className="font-display flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-xs font-semibold"
                  >
                    {group && (
                      <CompletionPie
                        size={13}
                        slices={selectedPlayers.map((player) => ({ color: player.color, filled: !!levels.scoresByPlayer[player.id]?.[open.key] }))}
                      />
                    )}
                    L{open.level}
                  </span>
                ))}
              </div>
            </Link>
          </li>
        ))}
        {targets.length === 0 && <li className="text-sm text-muted">Every level beaten. Legend.</li>}
      </ol>
    </section>
  );
}
