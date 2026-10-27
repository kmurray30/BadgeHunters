"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toggleBadgeTodo } from "@/app/actions/badges";
import { CompletionPie } from "@/components/completion-pie";
import { DetailSheet, PlayerStatusList } from "@/components/detail-sheet";
import { GroupFilters } from "@/components/group-filters";
import { PlayerPicker } from "@/components/player-picker";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { usePlayerSelection } from "@/hooks/use-player-selection";
import { DEFAULT_GROUP_FILTERS, describeGroupFilters, matchesGroupFilters, type GroupFilterState } from "@/lib/group-progress";
import type { BadgeCardData } from "@/lib/badge-cards";
import type { RosterPlayer } from "@/lib/roster";

const DIFFICULTY_STYLE: Record<BadgeCardData["difficulty"], { label: string; className: string; sortKey: number }> = {
  easy: { label: "Easy", className: "text-success border-success/30", sortKey: 1 },
  medium: { label: "Medium", className: "text-warning border-warning/30", sortKey: 2 },
  hard: { label: "Hard", className: "text-orange-400 border-orange-400/30", sortKey: 3 },
  impossible: { label: "Impossible?", className: "text-danger border-danger/30", sortKey: 4 },
  unknown: { label: "", className: "", sortKey: 99 },
};

const PLAYER_COUNT_LABEL: Record<string, string> = { lte_3: "≤3 players", gte_5: "5+ players" };

type SortKey = "number" | "difficulty" | "group";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "number", label: "A–Z" },
  { value: "difficulty", label: "Easiest first" },
  { value: "group", label: "Most needed first" },
];

interface BadgesClientProps {
  badges: BadgeCardData[];
  roster: RosterPlayer[];
  currentUserId: string;
}

export function BadgesClient({ badges, roster, currentUserId }: BadgesClientProps) {
  const { selectedIds, selectedPlayers, toggle, justMe, selectAll } = usePlayerSelection(roster, currentUserId);
  const [storedFilters, setFilters] = usePersistedState<GroupFilterState>("bh:badges:group-filters", DEFAULT_GROUP_FILTERS);
  const [sortKey, setSortKey] = usePersistedState<SortKey>("bh:badges:sort", "number");
  const [todoOnly, setTodoOnly] = usePersistedState("bh:badges:todo-only", false);
  const [search, setSearch] = useState("");
  const [todoIds, setTodoIds] = useState(() => new Set(badges.filter((badge) => badge.todoByMe).map((badge) => badge.id)));
  const [openBadgeId, setOpenBadgeId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const groupSize = selectedIds.length;
  // "Some" and "Not done by me" have no meaning with only one player selected.
  const filters: GroupFilterState = useMemo(
    () =>
      groupSize > 1 ? storedFilters : { progress: storedFilters.progress === "some" ? "all" : storedFilters.progress, notDoneByMe: false },
    [groupSize, storedFilters],
  );

  const filterSummary = describeGroupFilters(filters, groupSize);
  const doneSets = useMemo(() => new Map(badges.map((badge) => [badge.id, new Set(badge.doneBy)])), [badges]);
  const myDoneCount = badges.filter((badge) => doneSets.get(badge.id)!.has(currentUserId)).length;

  const visibleBadges = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedDoneCount = (badge: BadgeCardData) => selectedIds.filter((id) => doneSets.get(badge.id)!.has(id)).length;

    const list = badges.filter((badge) => {
      const done = doneSets.get(badge.id)!;
      if (query && !badge.name.toLowerCase().includes(query) && !badge.description.toLowerCase().includes(query)) return false;
      if (todoOnly && !todoIds.has(badge.id)) return false;
      return matchesGroupFilters((id) => done.has(id), selectedIds, currentUserId, filters);
    });

    return list.sort((badgeA, badgeB) => {
      if (sortKey === "difficulty") {
        const byDifficulty = DIFFICULTY_STYLE[badgeA.difficulty].sortKey - DIFFICULTY_STYLE[badgeB.difficulty].sortKey;
        if (byDifficulty !== 0) return byDifficulty;
      }
      if (sortKey === "group") {
        const byDone = selectedDoneCount(badgeA) - selectedDoneCount(badgeB);
        if (byDone !== 0) return byDone;
      }
      return badgeA.name.localeCompare(badgeB.name);
    });
  }, [badges, doneSets, search, todoOnly, todoIds, selectedIds, currentUserId, filters, sortKey]);

  function handleToggleTodo(badgeId: string) {
    setTodoIds((previous) => {
      const next = new Set(previous);
      if (next.has(badgeId)) next.delete(badgeId);
      else next.add(badgeId);
      return next;
    });
    startTransition(() => toggleBadgeTodo(badgeId));
  }

  const openBadge = openBadgeId ? badges.find((badge) => badge.id === openBadgeId) : null;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">Badges</h1>
        <p className="font-display pb-1 text-sm text-muted">
          <span className="text-lg font-bold text-foreground">{myDoneCount}</span> / {badges.length} yours
        </p>
      </div>

      <PlayerPicker roster={roster} selectedIds={selectedIds} onToggle={toggle} onJustMe={justMe} onSelectAll={selectAll} />

      <div className="mt-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search badges"
              className="w-full rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none transition placeholder:text-muted focus:border-accent"
            />
          </div>
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            aria-label="Sort badges"
            className="rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-accent"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4">
          <GroupFilters value={filters} onChange={setFilters} groupSize={groupSize} />
          <button
            type="button"
            aria-pressed={todoOnly}
            onClick={() => setTodoOnly(!todoOnly)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
              todoOnly ? "border-warning bg-warning/15 text-warning" : "border-border text-muted hover:text-foreground"
            }`}
          >
            ★ To-do
          </button>
        </div>
        <p className="text-xs text-muted">
          {visibleBadges.length} of {badges.length} badges
          {filterSummary && <> · {filterSummary}</>}
        </p>
      </div>

      <ul className="mt-2 space-y-2">
        {visibleBadges.map((badge) => {
          const done = doneSets.get(badge.id)!;
          const difficulty = DIFFICULTY_STYLE[badge.difficulty];
          const isTodo = todoIds.has(badge.id);
          const doneByMe = done.has(currentUserId);
          return (
            <li key={badge.id} className="panel flex items-start gap-3 p-3 transition hover:border-accent/40">
              <button
                type="button"
                onClick={() => setOpenBadgeId(badge.id)}
                aria-label={`Who has done ${badge.name}`}
                className="mt-0.5 shrink-0 rounded-full transition active:scale-90"
              >
                <CompletionPie
                  size={38}
                  slices={selectedPlayers.map((player) => ({ color: player.color, filled: done.has(player.id) }))}
                />
              </button>
              <Link href={`/badges/${badge.id}`} prefetch={false} className="min-w-0 flex-1">
                <h2 className="font-display font-bold uppercase leading-tight tracking-wide">{badge.name}</h2>
                <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-muted">{badge.description}</p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  {difficulty.label && <span className={`rounded-md border px-1.5 py-0.5 ${difficulty.className}`}>{difficulty.label}</span>}
                  {PLAYER_COUNT_LABEL[badge.playerCount] && (
                    <span className="rounded-md border border-highlight/30 px-1.5 py-0.5 text-highlight">{PLAYER_COUNT_LABEL[badge.playerCount]}</span>
                  )}
                  {badge.isPerVisit && <span className="rounded-md border border-accent/30 px-1.5 py-0.5 text-accent">One visit</span>}
                  {badge.games.map((game) => (
                    <span key={game} className="rounded-md bg-card-hover px-1.5 py-0.5 text-muted">
                      {game}
                    </span>
                  ))}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => handleToggleTodo(badge.id)}
                disabled={doneByMe}
                aria-pressed={isTodo}
                aria-label={doneByMe ? "Already done" : isTodo ? "Remove from to-do" : "Add to to-do"}
                className={`-mr-1 shrink-0 rounded-lg p-1.5 text-xl leading-none transition active:scale-90 ${
                  isTodo && !doneByMe ? "text-warning drop-shadow-[0_0_6px_var(--warning)]" : "text-border hover:text-muted"
                } disabled:opacity-0`}
              >
                ★
              </button>
            </li>
          );
        })}
      </ul>

      {visibleBadges.length === 0 && (
        <div className="panel mt-2 p-8 text-center text-muted">No badges match these filters.</div>
      )}

      {openBadge && (
        <DetailSheet title={openBadge.name} subtitle={openBadge.description} onClose={() => setOpenBadgeId(null)}>
          <PlayerStatusList
            rows={selectedPlayers.map((player) => ({ player, done: doneSets.get(openBadge.id)!.has(player.id) }))}
          />
          <Link
            href={`/badges/${openBadge.id}`}
            className="mt-4 block rounded-xl border border-border py-2.5 text-center text-sm font-semibold text-foreground transition hover:border-accent"
          >
            Open badge page
          </Link>
        </DetailSheet>
      )}
    </div>
  );
}
