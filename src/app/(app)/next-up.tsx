"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CompletionPie } from "@/components/completion-pie";
import { PlayerPicker } from "@/components/player-picker";
import { usePlayerSelection } from "@/hooks/use-player-selection";
import type { BadgeCardData } from "@/lib/badge-cards";
import type { LevelsData } from "@/lib/levels-grid";
import { badgesMostNeeded, levelsMostNeeded } from "@/lib/next-up";
import type { RosterPlayer } from "@/lib/roster";

const ITEMS_PER_LIST = 5;

interface NextUpProps {
  roster: RosterPlayer[];
  currentUserId: string;
  badges: BadgeCardData[];
  levels: LevelsData;
}

/** Badges and levels the selected players most need: good targets for the next visit. */
export function NextUp({ roster, currentUserId, badges, levels }: NextUpProps) {
  const { selectedIds, selectedPlayers, toggle, justMe, selectAll } = usePlayerSelection(roster, currentUserId);
  const badgeTargets = useMemo(() => badgesMostNeeded(badges, selectedIds, ITEMS_PER_LIST), [badges, selectedIds]);
  const levelTargets = useMemo(() => levelsMostNeeded(levels, selectedIds, ITEMS_PER_LIST), [levels, selectedIds]);
  const group = selectedIds.length > 1;

  const needLabel = (needCount: number) =>
    group ? (needCount === selectedIds.length ? "Everyone needs it" : `${needCount} of ${selectedIds.length} need it`) : null;

  return (
    <section className="panel mt-6 p-4">
      <h2 className="font-display text-lg font-bold uppercase tracking-wider">Next up</h2>
      <p className="mb-3 text-xs text-muted">
        {group ? "What the selected players most need. Easiest badges and lowest levels first." : "Your easiest open badges and lowest unbeaten levels."}
      </p>
      <PlayerPicker roster={roster} selectedIds={selectedIds} onToggle={toggle} onJustMe={justMe} onSelectAll={selectAll} sticky={false} />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">Badges</h3>
          <ul className="space-y-1.5">
            {badgeTargets.map(({ badge, needCount }) => {
              const done = new Set(badge.doneBy);
              return (
                <li key={badge.id}>
                  <Link href={`/badges/${badge.id}`} className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-2 transition hover:bg-card-hover">
                    <CompletionPie size={26} slices={selectedPlayers.map((player) => ({ color: player.color, filled: done.has(player.id) }))} />
                    <span className="min-w-0 flex-1">
                      <span className="font-display block truncate text-sm font-bold uppercase">{badge.name}</span>
                      {needLabel(needCount) && <span className="block text-[11px] text-muted">{needLabel(needCount)}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
            {badgeTargets.length === 0 && <li className="text-sm text-muted">All done. Nice.</li>}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-highlight">Levels</h3>
          <ul className="space-y-1.5">
            {levelTargets.map((target) => (
              <li key={target.key}>
                <Link href="/levels" className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-2 transition hover:bg-card-hover">
                  <CompletionPie
                    size={26}
                    slices={selectedPlayers.map((player) => ({ color: player.color, filled: !!levels.scoresByPlayer[player.id]?.[target.key] }))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-display block truncate text-sm font-bold uppercase">
                      {target.game.name} · L{target.level}
                    </span>
                    <span className="block text-[11px] text-muted">
                      {target.room.name}
                      {needLabel(target.needCount) && ` · ${needLabel(target.needCount)}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {levelTargets.length === 0 && <li className="text-sm text-muted">Every level beaten. Legend.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
