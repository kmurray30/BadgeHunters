"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toggleBadgeCompletion, updateBadgeDifficulty } from "@/app/actions/badges";
import type { Difficulty } from "@prisma/client";

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

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; color: string }[] = [
  { value: "easy", label: "Easy", color: "text-green-400" },
  { value: "medium", label: "Medium", color: "text-yellow-400" },
  { value: "hard", label: "Hard", color: "text-orange-400" },
  { value: "impossible", label: "Impossible", color: "text-red-400" },
  { value: "unknown", label: "???", color: "text-muted" },
];

function getDifficultyDisplay(badge: BadgeData): { label: string; color: string } {
  const personalDiff = badge.currentUserDifficulty;
  if (personalDiff && personalDiff !== "unknown") {
    const option = DIFFICULTY_OPTIONS.find((difficultyOption) => difficultyOption.value === personalDiff);
    return option ?? { label: "???", color: "text-muted" };
  }

  const numericMap: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };
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
    const option = DIFFICULTY_OPTIONS.find((difficultyOption) => difficultyOption.value === difficultyValue);
    return option ?? { label: "???", color: "text-muted" };
  }

  const option = DIFFICULTY_OPTIONS.find((difficultyOption) => difficultyOption.value === badge.defaultDifficulty);
  return option ?? { label: "???", color: "text-muted" };
}

export function BadgeListClient({ badges, currentUserId, currentUserRole, allUsers }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [completionFilter, setCompletionFilter] = useState<"all" | "completed" | "not_completed">("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [playerCountFilter, setPlayerCountFilter] = useState<string>("all");
  const [perVisitFilter, setPerVisitFilter] = useState<"all" | "per_visit" | "normal">("all");
  const [completedByFilter, setCompletedByFilter] = useState<string>("all");
  const [notCompletedByFilter, setNotCompletedByFilter] = useState<string>("all");

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

  const filteredBadges = useMemo(() => {
    return badges.filter((badge) => {
      // Text search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = badge.name.toLowerCase().includes(query);
        const matchesDescription = badge.description.toLowerCase().includes(query);
        const matchesNumber = badge.badgeNumber.toString().includes(query);
        if (!matchesName && !matchesDescription && !matchesNumber) return false;
      }

      // Completion filter
      if (completionFilter === "completed" && !badge.completedByCurrentUser) return false;
      if (completionFilter === "not_completed" && badge.completedByCurrentUser) return false;

      // Difficulty filter
      if (difficultyFilter !== "all") {
        const displayed = getDifficultyDisplay(badge);
        const difficultyOption = DIFFICULTY_OPTIONS.find((diffOpt) => diffOpt.value === difficultyFilter);
        if (difficultyOption && displayed.label !== difficultyOption.label) return false;
      }

      // Player count bucket
      if (playerCountFilter !== "all" && badge.playerCountBucket !== playerCountFilter) return false;

      // Per-visit filter
      if (perVisitFilter === "per_visit" && !badge.isPerVisit) return false;
      if (perVisitFilter === "normal" && badge.isPerVisit) return false;

      // Room filter
      if (roomFilter !== "all" && !badge.rooms.includes(roomFilter)) return false;

      // Game filter
      if (gameFilter !== "all" && !badge.games.includes(gameFilter)) return false;

      // Completed-by user filter
      if (completedByFilter !== "all") {
        const userCompleted = badge.completedByUsers.some((completedUser) => completedUser.id === completedByFilter);
        if (!userCompleted) return false;
      }

      // Not-completed-by user filter
      if (notCompletedByFilter !== "all") {
        const userCompleted = badge.completedByUsers.some((completedUser) => completedUser.id === notCompletedByFilter);
        if (userCompleted) return false;
      }

      return true;
    });
  }, [badges, searchQuery, completionFilter, difficultyFilter, playerCountFilter, perVisitFilter, roomFilter, gameFilter, completedByFilter, notCompletedByFilter]);

  const completionCount = badges.filter((badge) => badge.completedByCurrentUser).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
            placeholder="Search badges by name, description, or number..."
            className="w-full rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <select
          value={completionFilter}
          onChange={(event) => setCompletionFilter(event.target.value as typeof completionFilter)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          <option value="all">All badges</option>
          <option value="not_completed">Not completed</option>
          <option value="completed">Completed</option>
        </select>

        <select
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          <option value="all">Any difficulty</option>
          {DIFFICULTY_OPTIONS.map((difficultyOption) => (
            <option key={difficultyOption.value} value={difficultyOption.value}>{difficultyOption.label}</option>
          ))}
        </select>

        <select
          value={playerCountFilter}
          onChange={(event) => setPlayerCountFilter(event.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          <option value="all">Any player count</option>
          <option value="lte_3">3 or fewer</option>
          <option value="gte_5">5 or more</option>
          <option value="none">No preference</option>
        </select>

        <select
          value={perVisitFilter}
          onChange={(event) => setPerVisitFilter(event.target.value as typeof perVisitFilter)}
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
        >
          <option value="all">All types</option>
          <option value="per_visit">Per-visit only</option>
          <option value="normal">Normal only</option>
        </select>

        {allRooms.length > 0 && (
          <select
            value={roomFilter}
            onChange={(event) => setRoomFilter(event.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            <option value="all">Any room</option>
            {allRooms.map((room) => (
              <option key={room} value={room}>{room}</option>
            ))}
          </select>
        )}

        {allGames.length > 0 && (
          <select
            value={gameFilter}
            onChange={(event) => setGameFilter(event.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            <option value="all">Any game</option>
            {allGames.map((game) => (
              <option key={game} value={game}>{game}</option>
            ))}
          </select>
        )}

        {allUsers.length > 0 && (
          <>
            <select
              value={completedByFilter}
              onChange={(event) => setCompletedByFilter(event.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              <option value="all">Completed by anyone</option>
              {allUsers.map((appUser) => (
                <option key={appUser.id} value={appUser.id}>{appUser.displayName}</option>
              ))}
            </select>
            <select
              value={notCompletedByFilter}
              onChange={(event) => setNotCompletedByFilter(event.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
            >
              <option value="all">Not completed by (any)</option>
              {allUsers.map((appUser) => (
                <option key={appUser.id} value={appUser.id}>Not done by: {appUser.displayName}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* Results count */}
      <p className="mb-4 text-xs text-muted">
        Showing {filteredBadges.length} of {badges.length} badges
      </p>

      {/* Badge grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredBadges.map((badge) => {
          const difficultyDisplay = getDifficultyDisplay(badge);
          return (
            <div
              key={badge.id}
              className={`group relative rounded-xl border bg-card p-4 transition-colors hover:bg-card-hover ${
                badge.completedByCurrentUser ? "border-success/30" : "border-border"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <Link href={`/badges/${badge.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-border px-1.5 py-0.5 text-[10px] font-mono text-muted">
                      #{badge.badgeNumber}
                    </span>
                    <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                      {badge.name}
                    </h3>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">
                    {badge.description}
                  </p>
                </Link>

                {/* Completion toggle */}
                <button
                  onClick={() => toggleBadgeCompletion(badge.id)}
                  className={`shrink-0 rounded-lg border p-1.5 transition-colors ${
                    badge.completedByCurrentUser
                      ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
                      : "border-border text-muted hover:border-muted hover:text-foreground"
                  }`}
                  title={badge.completedByCurrentUser ? "Mark as not completed" : "Mark as completed"}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>

              {/* Tags row */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className={`text-[10px] font-medium ${difficultyDisplay.color}`}>
                  {difficultyDisplay.label}
                </span>

                {badge.isPerVisit && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                    Per-visit
                  </span>
                )}

                {badge.isMetaBadge && (
                  <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-medium text-purple-400">
                    Meta
                  </span>
                )}

                {badge.playerCountBucket === "lte_3" && (
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                    ≤3 players
                  </span>
                )}
                {badge.playerCountBucket === "gte_5" && (
                  <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-medium text-orange-400">
                    5+ players
                  </span>
                )}

                {badge.totalCompletions > 0 && (
                  <span className="ml-auto text-[10px] text-muted">
                    {badge.totalCompletions} done
                  </span>
                )}
              </div>

              {/* Completed-by user pills */}
              {badge.completedByUsers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {badge.completedByUsers.slice(0, 5).map((completedUser) => (
                    <span
                      key={completedUser.id}
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        completedUser.id === currentUserId
                          ? "bg-success/20 text-success"
                          : "bg-border text-muted"
                      }`}
                    >
                      {completedUser.displayName}
                    </span>
                  ))}
                  {badge.completedByUsers.length > 5 && (
                    <span className="rounded-full bg-border px-2 py-0.5 text-[10px] text-muted">
                      +{badge.completedByUsers.length - 5}
                    </span>
                  )}
                </div>
              )}

              {/* Quick difficulty selector */}
              <div className="mt-2">
                <select
                  value={badge.currentUserDifficulty ?? ""}
                  onChange={(event) => {
                    const selectedValue = event.target.value as Difficulty;
                    if (selectedValue) {
                      updateBadgeDifficulty(badge.id, selectedValue);
                    }
                  }}
                  className="w-full rounded border border-border bg-background px-2 py-1 text-[10px] text-muted focus:border-accent focus:outline-none"
                >
                  <option value="">Rate difficulty...</option>
                  {DIFFICULTY_OPTIONS.filter((diffOption) => diffOption.value !== "unknown").map((diffOption) => (
                    <option key={diffOption.value} value={diffOption.value}>{diffOption.label}</option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {filteredBadges.length === 0 && (
        <div className="py-12 text-center text-muted">
          <p className="text-lg font-medium">No badges match your filters</p>
          <p className="mt-1 text-sm">Try adjusting your search or filter criteria.</p>
        </div>
      )}
    </div>
  );
}
