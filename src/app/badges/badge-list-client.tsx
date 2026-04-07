"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toggleBadgeCompletion } from "@/app/actions/badges";

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

const BADGE_GRID_COLUMNS = "auto minmax(0,2.5fr) minmax(0,3fr) 5rem 4rem 3.5rem";

type SortOption = "number" | "name" | "difficulty" | "completions" | "players";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "number", label: "Badge #" },
  { value: "name", label: "Name" },
  { value: "difficulty", label: "Difficulty" },
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
  const [searchQuery, setSearchQuery] = useState("");
  const [completionFilter, setCompletionFilter] = useState<"all" | "completed" | "not_completed">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [playerCountFilter, setPlayerCountFilter] = useState<string>("all");
  const [perVisitFilter, setPerVisitFilter] = useState<"all" | "per_visit" | "normal">("all");
  const [completedByFilter, setCompletedByFilter] = useState<string>("all");
  const [notCompletedByFilter, setNotCompletedByFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("number");
  const [sortAsc, setSortAsc] = useState(true);

  const allRooms = useMemo(() => {
    const roomSet = new Set<string>();
    badges.forEach((badge) => badge.rooms.forEach((room) => roomSet.add(room)));
    return Array.from(roomSet).sort();
  }, [badges]);

  const allGames = useMemo(() => {
    const gameSet = new Set<string>();
    badges.forEach((badge) => badge.games.forEach((game) => gameSet.add(game)));
    return Array.from(gameSet).sort();
  }, [badges]);

  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [gameFilter, setGameFilter] = useState<string>("all");

  const filteredAndSortedBadges = useMemo(() => {
    const filtered = badges.filter((badge) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !badge.name.toLowerCase().includes(query) &&
          !badge.description.toLowerCase().includes(query) &&
          !badge.badgeNumber.toString().includes(query)
        ) return false;
      }
      if (completionFilter === "completed" && !badge.completedByCurrentUser) return false;
      if (completionFilter === "not_completed" && badge.completedByCurrentUser) return false;
      if (difficultyFilter !== "all") {
        const displayed = getDifficultyDisplay(badge);
        const diffOption = DIFFICULTY_OPTIONS.find((difficultyOpt) => difficultyOpt.value === difficultyFilter);
        if (diffOption && displayed.label !== diffOption.label) return false;
      }
      if (playerCountFilter !== "all" && getPlayerCountDisplay(badge).bucket !== playerCountFilter) return false;
      if (perVisitFilter === "per_visit" && !badge.isPerVisit) return false;
      if (perVisitFilter === "normal" && badge.isPerVisit) return false;
      if (roomFilter !== "all" && !badge.rooms.includes(roomFilter)) return false;
      if (gameFilter !== "all" && !badge.games.includes(gameFilter)) return false;
      if (completedByFilter !== "all" && !badge.completedByUsers.some((completedUser) => completedUser.id === completedByFilter)) return false;
      if (notCompletedByFilter !== "all" && badge.completedByUsers.some((completedUser) => completedUser.id === notCompletedByFilter)) return false;
      return true;
    });

    filtered.sort((badgeA, badgeB) => {
      let comparison = 0;
      switch (sortBy) {
        case "number":
          comparison = badgeA.badgeNumber - badgeB.badgeNumber;
          break;
        case "name":
          comparison = badgeA.name.localeCompare(badgeB.name);
          break;
        case "difficulty":
          comparison = getDifficultyDisplay(badgeA).sortKey - getDifficultyDisplay(badgeB).sortKey;
          break;
        case "completions":
          comparison = badgeA.totalCompletions - badgeB.totalCompletions;
          break;
        case "players":
          comparison = getPlayerCountDisplay(badgeA).sortKey - getPlayerCountDisplay(badgeB).sortKey;
          break;
      }
      return sortAsc ? comparison : -comparison;
    });

    return filtered;
  }, [badges, searchQuery, completionFilter, difficultyFilter, playerCountFilter, perVisitFilter, roomFilter, gameFilter, completedByFilter, notCompletedByFilter, sortBy, sortAsc]);

  const completionCount = badges.filter((badge) => badge.completedByCurrentUser).length;

  function handleSortToggle(option: SortOption) {
    if (sortBy === option) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(option);
      setSortAsc(true);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Badges</h1>
          <p className="text-sm text-muted">
            {completionCount} / {badges.length} completed
          </p>
        </div>
        <div className="w-full sm:w-80">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name, description, or #..."
            className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Filters + Sort row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={completionFilter} onChange={(event) => setCompletionFilter(event.target.value as typeof completionFilter)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
          <option value="all">All</option>
          <option value="not_completed">Not completed</option>
          <option value="completed">Completed</option>
        </select>
        <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
          <option value="all">Any difficulty</option>
          {DIFFICULTY_OPTIONS.map((diffOption) => (<option key={diffOption.value} value={diffOption.value}>{diffOption.label}</option>))}
        </select>
        <select value={playerCountFilter} onChange={(event) => setPlayerCountFilter(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
          <option value="all">Any # players</option>
          <option value="lte_3">≤3 players</option>
          <option value="gte_5">5+ players</option>
          <option value="none">No pref</option>
        </select>
        <select value={perVisitFilter} onChange={(event) => setPerVisitFilter(event.target.value as typeof perVisitFilter)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
          <option value="all">All types</option>
          <option value="per_visit">Per-visit</option>
          <option value="normal">Normal</option>
        </select>
        {allRooms.length > 0 && (
          <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
            <option value="all">Any room</option>
            {allRooms.map((room) => (<option key={room} value={room}>{room}</option>))}
          </select>
        )}
        {allGames.length > 0 && (
          <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
            <option value="all">Any game</option>
            {allGames.map((game) => (<option key={game} value={game}>{game}</option>))}
          </select>
        )}
        {allUsers.length > 0 && (
          <>
            <select value={completedByFilter} onChange={(event) => setCompletedByFilter(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
              <option value="all">Completed by</option>
              {allUsers.map((appUser) => (<option key={appUser.id} value={appUser.id}>{appUser.displayName}</option>))}
            </select>
            <select value={notCompletedByFilter} onChange={(event) => setNotCompletedByFilter(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
              <option value="all">Not done by</option>
              {allUsers.map((appUser) => (<option key={appUser.id} value={appUser.id}>{appUser.displayName}</option>))}
            </select>
          </>
        )}

        {/* Sort — right aligned */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[10px] text-muted">Sort:</span>
          <select
            value={sortBy}
            onChange={(event) => handleSortToggle(event.target.value as SortOption)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
            title={sortAsc ? "Ascending" : "Descending"}
          >
            {sortAsc ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Results count */}
      <p className="mb-2 text-[10px] text-muted">
        {filteredAndSortedBadges.length} of {badges.length}
      </p>

      {/* Table header */}
      <div className="rounded-t-lg border border-border bg-card">
        <div className="grid items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: BADGE_GRID_COLUMNS }}>
          <span className="w-5"></span>
          <span>Name</span>
          <span>Description</span>
          <span className="text-center">Difficulty</span>
          <span className="text-center">Players</span>
          <span className="text-center">Done</span>
        </div>
      </div>

      {/* Badge rows */}
      <div className="divide-y divide-border rounded-b-lg border-x border-b border-border">
        {filteredAndSortedBadges.map((badge) => {
          const difficultyDisplay = getDifficultyDisplay(badge);
          return (
            <Link
              key={badge.id}
              href={`/badges/${badge.id}`}
              className={`group grid items-center gap-2 px-3 py-2 transition-colors hover:bg-card-hover ${
                badge.completedByCurrentUser ? "bg-success/[0.06]" : ""
              }`}
              style={{ gridTemplateColumns: BADGE_GRID_COLUMNS }}
            >
              <span className="w-5 text-[10px] font-mono text-muted tabular-nums">
                {badge.badgeNumber}
              </span>

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
              </div>

              <span className="min-w-0 truncate text-xs text-muted">{badge.description}</span>

              <span className={`min-w-0 text-center text-[11px] font-medium ${difficultyDisplay.color}`}>
                {difficultyDisplay.label}
              </span>

              <span className={`min-w-0 text-center text-[11px] ${getPlayerCountDisplay(badge).color}`}>
                {getPlayerCountDisplay(badge).label}
              </span>

              <div className="flex justify-center" onClick={(event) => event.preventDefault()}>
                <button
                  onClick={() => toggleBadgeCompletion(badge.id)}
                  className={`rounded p-0.5 transition-colors ${
                    badge.completedByCurrentUser
                      ? "text-success hover:text-success/70"
                      : "text-border hover:text-muted"
                  }`}
                  title={badge.completedByCurrentUser ? "Mark incomplete" : "Mark complete"}
                >
                  <svg className="h-4 w-4" fill={badge.completedByCurrentUser ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </Link>
          );
        })}
      </div>

      {filteredAndSortedBadges.length === 0 && (
        <div className="py-12 text-center text-muted">
          <p className="text-lg font-medium">No badges match your filters</p>
          <p className="mt-1 text-sm">Try adjusting your search or filter criteria.</p>
        </div>
      )}
    </div>
  );
}
