"use client";

import { toggleBadgeTodo } from "@/app/actions/badges";
import { BadgeCheckbox, BadgeTable, type BadgeTableRow, type ColumnHeader } from "@/components/badge-table";
import type { SortCriterion } from "@/components/multi-sort";
import { useMemo, useState } from "react";

interface PlayerBadge {
  id: string;
  badgeId: string;
  badgeName: string;
  badgeNumber: number;
  description: string;
  isPerVisit: boolean;
  isMetaBadge: boolean;
  completedAt: string | null;
  /** Viewed player's personal ratings — used for Difficulty/Players columns */
  playerDifficulty: string | null;
  playerPlayerCount: string | null;
  /** Current user's personal ratings — kept for sort keys on own profile */
  currentUserDifficulty: string | null;
  currentUserPlayerCount: string | null;
  communityDifficultyVotes: string[];
  communityPlayerCountVotes: string[];
  doneByCurrentUser: boolean;
  todoByCurrentUser: boolean;
}

interface Props {
  badges: PlayerBadge[];
  isOwnProfile: boolean;
}

const COLUMNS: ColumnHeader[] = [
  { label: "#", width: "1.5rem", align: "right" },
  { label: "Name", width: "minmax(0,10rem)", sortField: "name" },
  { label: "Description", width: "minmax(6rem,1fr)" },
  { label: "Difficulty\n(Their Vote)", width: "6rem", align: "right", sortField: "difficulty" },
  { label: "# Players\n(Their Vote)", width: "5.5rem", align: "right", sortField: "players" },
  { label: "Completed on", width: "5.5rem", align: "right", sortField: "completedAt", sortDefaultDescending: true },
  { label: "To Do By Me", width: "4rem", align: "center", sortField: "todo", sortDefaultDescending: true },
  { label: "Done By Me", width: "3.5rem", align: "center", sortField: "done" },
];

const DIFFICULTY_MAP: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };
const DIFFICULTY_OPTIONS = [
  { value: "easy", label: "Easy", color: "text-green-400" },
  { value: "medium", label: "Medium", color: "text-yellow-400" },
  { value: "hard", label: "Hard", color: "text-orange-400" },
  { value: "impossible", label: "Impossible?", color: "text-red-400" },
];
const PLAYER_COUNT_SORT: Record<string, number> = { lte_3: 1, none: 2, gte_5: 3 };

function getDifficultyDisplay(badge: PlayerBadge): { label: string; color: string; sortKey: number } {
  // Use the viewed player's personal rating first, then community average
  const personalDiff = badge.playerDifficulty;
  if (personalDiff && personalDiff !== "unknown") {
    const option = DIFFICULTY_OPTIONS.find((o) => o.value === personalDiff);
    return { ...(option ?? { label: "???", color: "text-muted" }), sortKey: DIFFICULTY_MAP[personalDiff] ?? 99 };
  }
  const votes: number[] = badge.communityDifficultyVotes
    .filter((v) => v && v !== "unknown" && DIFFICULTY_MAP[v] !== undefined)
    .map((v) => DIFFICULTY_MAP[v]);
  if (votes.length > 0) {
    const mean = votes.reduce((sum, v) => sum + v, 0) / votes.length;
    const rounded = Math.max(1, Math.min(4, Math.round(mean)));
    const key = (["", "easy", "medium", "hard", "impossible"] as const)[rounded];
    const option = DIFFICULTY_OPTIONS.find((o) => o.value === key);
    return { ...(option ?? { label: "???", color: "text-muted" }), sortKey: rounded };
  }
  return { label: "???", color: "text-muted", sortKey: 99 };
}

function getPlayerCountDisplay(badge: PlayerBadge): { label: string; color: string; sortKey: number } {
  // Use the viewed player's personal rating first, then community mode
  const personal = badge.playerPlayerCount;
  if (personal && personal !== "none") {
    return {
      label: personal === "lte_3" ? "≤3" : personal === "gte_5" ? "5+" : "Any",
      color: personal === "lte_3" ? "text-blue-400" : personal === "gte_5" ? "text-orange-400" : "text-muted",
      sortKey: PLAYER_COUNT_SORT[personal] ?? 2,
    };
  }
  const counts: Record<string, number> = {};
  for (const vote of badge.communityPlayerCountVotes) {
    if (vote !== "none") counts[vote] = (counts[vote] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = entries[0]?.[0];
  if (!winner) return { label: "Any", color: "text-muted", sortKey: 2 };
  return {
    label: winner === "lte_3" ? "≤3" : winner === "gte_5" ? "5+" : "Any",
    color: winner === "lte_3" ? "text-blue-400" : winner === "gte_5" ? "text-orange-400" : "text-muted",
    sortKey: PLAYER_COUNT_SORT[winner] ?? 2,
  };
}

export function PlayerBadgesClient({ badges, isOwnProfile }: Props) {
  const [sortCriteria, setSortCriteria] = useState<SortCriterion[]>([
    { field: "completedAt", ascending: false },
  ]);

  const sorted = useMemo(() => {
    return [...badges].sort((a, b) => {
      for (const criterion of sortCriteria) {
        let cmp = 0;
        switch (criterion.field) {
          case "name": cmp = a.badgeName.localeCompare(b.badgeName); break;
          case "difficulty": cmp = getDifficultyDisplay(a).sortKey - getDifficultyDisplay(b).sortKey; break;
          case "players": cmp = getPlayerCountDisplay(a).sortKey - getPlayerCountDisplay(b).sortKey; break;
          case "todo": cmp = (a.todoByCurrentUser ? 1 : 0) - (b.todoByCurrentUser ? 1 : 0); break;
          case "done": cmp = (a.doneByCurrentUser ? 1 : 0) - (b.doneByCurrentUser ? 1 : 0); break;
          case "completedAt": {
            const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
            const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
            cmp = aTime - bTime;
            break;
          }
        }
        if (cmp !== 0) return criterion.ascending ? cmp : -cmp;
      }
      return a.badgeNumber - b.badgeNumber;
    });
  }, [badges, sortCriteria]);

  if (badges.length === 0) {
    return <p className="text-sm text-muted">No badges completed yet.</p>;
  }

  const rows: BadgeTableRow[] = sorted.map((badge): BadgeTableRow => {
    const difficultyDisplay = getDifficultyDisplay(badge);
    const playerCount = getPlayerCountDisplay(badge);

    return {
      key: badge.id,
      href: `/badges/${badge.badgeId}`,
      className: badge.doneByCurrentUser
        ? "bg-completed hover:bg-completed-hover"
        : badge.todoByCurrentUser
          ? "bg-selection hover:bg-selection-hover"
          : "hover:bg-card-hover",
      cells: [
        <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{badge.badgeNumber}</span>,
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate text-sm font-medium text-foreground">{badge.badgeName}</span>
          {badge.isPerVisit && (
            <span className="shrink-0 rounded bg-accent/20 px-1 py-px text-[9px] font-medium text-accent">visit-specific</span>
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
        <span className="min-w-0 text-[10px] text-muted tabular-nums">
          {badge.completedAt ? new Date(badge.completedAt).toLocaleDateString() : "—"}
        </span>,
        // To Do — toggleable (disabled if done by current user)
        isOwnProfile ? (
          <BadgeCheckbox
            checked={badge.todoByCurrentUser}
            disabled={badge.doneByCurrentUser}
            title={badge.doneByCurrentUser ? "Already completed" : badge.todoByCurrentUser ? "Remove from To Do" : "Mark as To Do"}
            onClick={() => toggleBadgeTodo(badge.badgeId)}
            preventLinkNavigation
            checkedClassName="border-amber-500 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
            crossWhenDisabled
            useStar
          />
        ) : (
          <BadgeCheckbox
            checked={badge.todoByCurrentUser}
            disabled={badge.doneByCurrentUser}
            title={badge.doneByCurrentUser ? "Already completed by you" : badge.todoByCurrentUser ? "Remove from your To Do" : "Add to your To Do"}
            onClick={() => toggleBadgeTodo(badge.badgeId)}
            preventLinkNavigation
            checkedClassName="border-amber-500 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
            crossWhenDisabled
            useStar
          />
        ),
        // Done By Me — static indicator, not editable from this page
        <span
          className={`flex items-center justify-center ${badge.doneByCurrentUser ? "text-success" : "text-border"}`}
          title={badge.doneByCurrentUser ? "You've completed this badge" : "Not completed by you"}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>,
      ],
    };
  });

  return (
    <BadgeTable
      columns={COLUMNS}
      rows={rows}
      sortCriteria={sortCriteria}
      onSortChange={setSortCriteria}
    />
  );
}
