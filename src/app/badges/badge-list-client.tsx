"use client";

import { toggleBadgeCompletion, toggleBadgeTodo } from "@/app/actions/badges";
import { BadgeCheckbox, BadgeTable, type BadgeTableRow, type ColumnHeader } from "@/components/badge-table";
import { MultiFilter, type ActiveFilter, type FilterDefinition } from "@/components/multi-filter";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { MultiSort, type SortCriterion, type SortField } from "@/components/multi-sort";
import { useMemo, useState } from "react";

interface BadgeUser {
  id: string;
  displayName: string;
}

interface BadgeData {
  id: string;
  badgeNumber: number;
  name: string;
  description: string;
  rooms: string[];
  games: string[];
  playerCountBucket: string;
  tags: string[];
  defaultDifficulty: string;
  isPerVisit: boolean;
  isMetaBadge: boolean;
  completedByCurrentUser: boolean;
  isTodoByCurrentUser: boolean;
  currentUserDifficulty: string | null;
  currentUserPlayerCount: string | null;
  communityPlayerCountVotes: string[];
  completedByUsers: BadgeUser[];
  totalCompletions: number;
  communityDifficultyVotes: (string | null)[];
}

interface Props {
  badges: BadgeData[];
  currentUserId: string;
  currentUserRole: string;
  allUsers: BadgeUser[];
}

const DIFFICULTY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "easy", label: "Easy", color: "text-green-400" },
  { value: "medium", label: "Medium", color: "text-yellow-400" },
  { value: "hard", label: "Hard", color: "text-orange-400" },
  { value: "impossible", label: "Impossible", color: "text-red-400" },
  { value: "unknown", label: "???", color: "text-muted" },
];

const BADGE_TABLE_COLUMNS: ColumnHeader[] = [
  { label: "#", width: "1.5rem", align: "right" },
  { label: "Name", width: "minmax(0,12rem)", sortField: "name" },
  { label: "Description", width: "minmax(0,1fr)" },
  { label: "Difficulty", width: "5rem", align: "right", sortField: "difficulty" },
  { label: "Players", width: "4rem", align: "right", sortField: "players" },
  { label: "To Do", width: "3.5rem", align: "center", sortField: "todo", sortDefaultDescending: true },
  { label: "Done", width: "3.5rem", align: "center", sortField: "done" },
];

const SORT_FIELDS: SortField[] = [
  { value: "todo", label: "To Do" },
  { value: "done", label: "Done" },
  { value: "difficulty", label: "Difficulty" },
  { value: "name", label: "Name" },
  { value: "completions", label: "Completions" },
  { value: "players", label: "Player count" },
];

function getDifficultyDisplay(badge: BadgeData): { label: string; color: string; sortKey: number } {
  const numericMap: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };

  const personalDiff = badge.currentUserDifficulty;
  if (personalDiff && personalDiff !== "unknown") {
    const option = DIFFICULTY_OPTIONS.find((diffOption) => diffOption.value === personalDiff);
    return { ...(option ?? { label: "???", color: "text-muted" }), sortKey: numericMap[personalDiff] ?? 99 };
  }

  const numericVotes: number[] = [];
  for (const vote of badge.communityDifficultyVotes) {
    if (vote && vote !== "unknown" && numericMap[vote] !== undefined) {
      numericVotes.push(numericMap[vote]);
    }
  }
  if (badge.defaultDifficulty !== "unknown" && numericMap[badge.defaultDifficulty] !== undefined) {
    numericVotes.push(numericMap[badge.defaultDifficulty]);
  }

  if (numericVotes.length > 0) {
    const mean = numericVotes.reduce((sum, value) => sum + value, 0) / numericVotes.length;
    const rounded = Math.max(1, Math.min(4, Math.round(mean)));
    const reverseMap: Record<number, string> = { 1: "easy", 2: "medium", 3: "hard", 4: "impossible" };
    const difficultyValue = reverseMap[rounded];
    const option = DIFFICULTY_OPTIONS.find((diffOption) => diffOption.value === difficultyValue);
    return { ...(option ?? { label: "???", color: "text-muted" }), sortKey: rounded };
  }

  const option = DIFFICULTY_OPTIONS.find((diffOption) => diffOption.value === badge.defaultDifficulty);
  return { ...(option ?? { label: "???", color: "text-muted" }), sortKey: numericMap[badge.defaultDifficulty] ?? 99 };
}

const PLAYER_COUNT_SORT: Record<string, number> = { lte_3: 1, none: 2, gte_5: 3 };

function playerCountLabel(bucket: string): string {
  if (bucket === "lte_3") return "≤3";
  if (bucket === "gte_5") return "5+";
  return "Any";
}

/**
 * Resolve the displayed player count bucket with the same precedence as difficulty:
 *   1. Current user's personal setting (always wins)
 *   2. Community mode (most common vote among all users)
 *   3. Badge default from the seed data
 */
function getPlayerCountDisplay(badge: BadgeData): { bucket: string; label: string; color: string; sortKey: number } {
  const personal = badge.currentUserPlayerCount;
  if (personal && personal !== "none") {
    return {
      bucket: personal,
      label: playerCountLabel(personal),
      color: personal === "lte_3" ? "text-blue-400" : personal === "gte_5" ? "text-orange-400" : "text-muted",
      sortKey: PLAYER_COUNT_SORT[personal] ?? 2,
    };
  }

  if (badge.communityPlayerCountVotes.length > 0) {
    const counts: Record<string, number> = {};
    for (const vote of badge.communityPlayerCountVotes) {
      if (vote !== "none") counts[vote] = (counts[vote] ?? 0) + 1;
    }
    const entries = Object.entries(counts);
    if (entries.length > 0) {
      entries.sort((entryA, entryB) => entryB[1] - entryA[1]);
      const winner = entries[0][0];
      return {
        bucket: winner,
        label: playerCountLabel(winner),
        color: winner === "lte_3" ? "text-blue-400" : winner === "gte_5" ? "text-orange-400" : "text-muted",
        sortKey: PLAYER_COUNT_SORT[winner] ?? 2,
      };
    }
  }

  const fallback = badge.playerCountBucket;
  return {
    bucket: fallback,
    label: playerCountLabel(fallback),
    color: fallback === "lte_3" ? "text-blue-400" : fallback === "gte_5" ? "text-orange-400" : "text-muted",
    sortKey: PLAYER_COUNT_SORT[fallback] ?? 2,
  };
}

export function BadgeListClient({ badges, currentUserId, currentUserRole, allUsers }: Props) {
  const [searchQuery, setSearchQuery] = usePersistedState("bh:badges:search", "");
  const [activeFilters, setActiveFilters] = usePersistedState<ActiveFilter[]>("bh:badges:filters", [
    { key: "completion", value: "not_completed" },
  ]);
  const [sortCriteria, setSortCriteria] = usePersistedState<SortCriterion[]>("bh:badges:sort", [
    { field: "todo", ascending: false },
    { field: "difficulty", ascending: true },
  ]);

  const allRooms = useMemo(() => {
    const roomSet = new Set<string>();
    badges.forEach((badge) => badge.rooms.forEach((room) => roomSet.add(room)));
    return Array.from(roomSet).sort();
  }, [badges]);

  const filterDefinitions = useMemo<FilterDefinition[]>(() => {
    const defs: FilterDefinition[] = [
      { key: "completion", label: "Completion", options: [
        { value: "all", label: "All" },
        { value: "not_completed", label: "Not completed" },
        { value: "completed", label: "Completed" },
      ]},
      { key: "todo", label: "To Do", options: [
        { value: "all", label: "All" },
        { value: "todo", label: "To Do only" },
        { value: "not_todo", label: "Not To Do" },
      ]},
      { key: "difficulty", label: "Difficulty", options: [
        { value: "all", label: "Any difficulty" },
        ...DIFFICULTY_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
      ]},
      { key: "players", label: "Players", options: [
        { value: "all", label: "Any # players" },
        { value: "lte_3", label: "≤3 players" },
        { value: "gte_5", label: "5+ players" },
      ]},
      { key: "type", label: "Type", options: [
        { value: "all", label: "All types" },
        { value: "per_visit", label: "Per-visit" },
        { value: "normal", label: "Normal" },
      ]},
    ];
    if (allRooms.length > 0) {
      defs.push({ key: "room", label: "Room", options: [
        { value: "all", label: "Any room" },
        ...allRooms.map((room) => ({ value: room, label: room })),
      ]});
    }
    if (allUsers.length > 0) {
      defs.push(
        { key: "completedBy", label: "Completed by", options: [
          { value: "all", label: "Anyone" },
          ...allUsers.map((appUser) => ({ value: appUser.id, label: appUser.displayName })),
        ]},
        { key: "notDoneBy", label: "Not completed by", options: [
          { value: "all", label: "Anyone" },
          ...allUsers.map((appUser) => ({ value: appUser.id, label: appUser.displayName })),
        ]},
      );
    }
    return defs;
  }, [allRooms, allUsers]);

  function getFilterVal(key: string): string {
    return activeFilters.find((filter) => filter.key === key)?.value ?? "all";
  }

  function compareBadges(badgeA: BadgeData, badgeB: BadgeData, field: string): number {
    switch (field) {
      case "number": return badgeA.badgeNumber - badgeB.badgeNumber;
      case "name": return badgeA.name.localeCompare(badgeB.name);
      case "difficulty": return getDifficultyDisplay(badgeA).sortKey - getDifficultyDisplay(badgeB).sortKey;
      case "completions": return badgeA.totalCompletions - badgeB.totalCompletions;
      case "players": return getPlayerCountDisplay(badgeA).sortKey - getPlayerCountDisplay(badgeB).sortKey;
      case "todo": return (badgeA.isTodoByCurrentUser ? 1 : 0) - (badgeB.isTodoByCurrentUser ? 1 : 0);
      case "done": return (badgeA.completedByCurrentUser ? 1 : 0) - (badgeB.completedByCurrentUser ? 1 : 0);
      default: return 0;
    }
  }

  const filteredAndSortedBadges = useMemo(() => {
    const completionVal = getFilterVal("completion");
    const todoVal = getFilterVal("todo");
    const difficultyVal = getFilterVal("difficulty");
    const playersVal = getFilterVal("players");
    const typeVal = getFilterVal("type");
    const roomVal = getFilterVal("room");
    const completedByVal = getFilterVal("completedBy");
    const notDoneByVal = getFilterVal("notDoneBy");

    const filtered = badges.filter((badge) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !badge.name.toLowerCase().includes(query) &&
          !badge.description.toLowerCase().includes(query) &&
          !badge.badgeNumber.toString().includes(query)
        ) return false;
      }
      if (completionVal === "completed" && !badge.completedByCurrentUser) return false;
      if (completionVal === "not_completed" && badge.completedByCurrentUser) return false;
      if (todoVal === "todo" && !badge.isTodoByCurrentUser) return false;
      if (todoVal === "not_todo" && badge.isTodoByCurrentUser) return false;
      if (difficultyVal !== "all") {
        const displayed = getDifficultyDisplay(badge);
        const diffOption = DIFFICULTY_OPTIONS.find((difficultyOpt) => difficultyOpt.value === difficultyVal);
        if (diffOption && displayed.label !== diffOption.label) return false;
      }
      if (playersVal !== "all" && getPlayerCountDisplay(badge).bucket !== playersVal) return false;
      if (typeVal === "per_visit" && !badge.isPerVisit) return false;
      if (typeVal === "normal" && badge.isPerVisit) return false;
      if (roomVal !== "all" && !badge.rooms.includes(roomVal)) return false;
      if (completedByVal !== "all" && !badge.completedByUsers.some((completedUser) => completedUser.id === completedByVal)) return false;
      if (notDoneByVal !== "all" && badge.completedByUsers.some((completedUser) => completedUser.id === notDoneByVal)) return false;
      return true;
    });

    filtered.sort((badgeA, badgeB) => {
      for (const criterion of sortCriteria) {
        const comparison = compareBadges(badgeA, badgeB, criterion.field);
        if (comparison !== 0) return criterion.ascending ? comparison : -comparison;
      }
      return badgeA.badgeNumber - badgeB.badgeNumber;
    });

    return filtered;
  }, [badges, searchQuery, activeFilters, sortCriteria]);

  const completionCount = badges.filter((badge) => badge.completedByCurrentUser).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Badges</h1>
          <p className="text-sm text-muted">
            {completionCount} / {badges.length} completed
          </p>
        </div>
      </div>

      {/* Filter + Sort bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MultiFilter
          definitions={filterDefinitions}
          activeFilters={activeFilters}
          onChange={setActiveFilters}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search by name, description, or #..."
        />
        <div className="ml-auto">
          <MultiSort availableFields={SORT_FIELDS} criteria={sortCriteria} onChange={setSortCriteria} />
        </div>
      </div>

      {/* Results count */}
      <p className="mb-2 text-[10px] text-muted">
        {filteredAndSortedBadges.length} of {badges.length}
      </p>

      <BadgeTable
        columns={BADGE_TABLE_COLUMNS}
        sortCriteria={sortCriteria}
        onSortChange={setSortCriteria}
        rows={filteredAndSortedBadges.map((badge): BadgeTableRow => {
          const difficultyDisplay = getDifficultyDisplay(badge);
          const playerCount = getPlayerCountDisplay(badge);
          return {
            key: badge.id,
            href: `/badges/${badge.id}`,
            className: badge.completedByCurrentUser
              ? "bg-completed hover:bg-completed-hover"
              : badge.isTodoByCurrentUser
                ? "bg-selection hover:bg-selection-hover"
                : "hover:bg-card-hover",
            cells: [
              <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{badge.badgeNumber}</span>,
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate text-sm font-medium text-foreground group-hover:text-accent transition-colors">
                  {badge.name}
                </span>
                {badge.isPerVisit && (
                  <span className="shrink-0 rounded bg-accent/20 px-1 py-px text-[9px] font-medium text-accent">visit</span>
                )}
                {badge.isMetaBadge && (
                  <span className="shrink-0 rounded bg-purple-500/20 px-1 py-px text-[9px] font-medium text-purple-400">meta</span>
                )}
              </div>,
              <span className="block min-w-0 truncate text-xs text-muted">{badge.description}</span>,
              <span className={`min-w-0 text-center text-[11px] font-medium ${difficultyDisplay.color}`}>
                {difficultyDisplay.label}
              </span>,
              <span className={`min-w-0 text-center text-[11px] ${playerCount.color}`}>
                {playerCount.label}
              </span>,
              <BadgeCheckbox
                checked={badge.isTodoByCurrentUser}
                title={badge.completedByCurrentUser ? "Already completed — can't mark To Do" : badge.isTodoByCurrentUser ? "Remove from To Do" : "Mark as To Do"}
                onClick={() => toggleBadgeTodo(badge.id)}
                preventLinkNavigation
                disabled={badge.completedByCurrentUser}
                checkedClassName="border-amber-500 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                crossWhenDisabled
              />,
              <BadgeCheckbox
                checked={badge.completedByCurrentUser}
                title={badge.completedByCurrentUser ? "Mark incomplete" : "Mark complete"}
                onClick={() => toggleBadgeCompletion(badge.id)}
                preventLinkNavigation
              />,
            ],
          };
        })}
        emptyState={
          <div className="py-12 text-center text-muted">
            <p className="text-lg font-medium">No badges match your filters</p>
            <p className="mt-1 text-sm">Try adjusting your search or filter criteria.</p>
          </div>
        }
      />
    </div>
  );
}
