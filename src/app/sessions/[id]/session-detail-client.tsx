"use client";

import {
    acknowledgeSession,
    addGhostMember,
    addSessionMember,
    cancelSessionReview,
    completeSession,
    joinSession,
    removeGhostMember,
    removeSessionMember,
    reopenSession,
    toggleBadgeSelection,
    toggleSessionBadgeCompletion,
} from "@/app/actions/sessions";
import { BackButton } from "@/components/back-button";
import { BadgeCheckbox, BadgeTable, type BadgeTableRow, type BadgeTableSection, type ColumnHeader } from "@/components/badge-table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MultiFilter, type ActiveFilter, type FilterDefinition } from "@/components/multi-filter";
import { MultiSort, type SortCriterion, type SortField } from "@/components/multi-sort";
import { usePersistedState } from "@/hooks/use-persisted-state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

const YOUR_BADGES_COLUMNS: ColumnHeader[] = [
  { label: "#", width: "1.5rem", align: "right" },
  { label: "Name", width: "minmax(0,12rem)", sortField: "name" },
  { label: "Description", width: "minmax(0,1fr)" },
  { label: "Difficulty", width: "5rem", align: "right", sortField: "difficulty" },
  { label: "Players", width: "4rem", align: "right", sortField: "players" },
  { label: "Need", width: "4rem", align: "right", sortField: "need", sortDefaultDescending: true },
  { label: "To Do", width: "3.5rem", align: "center", sortField: "todo", sortDefaultDescending: true },
];

const GROUP_BADGES_COLUMNS: ColumnHeader[] = [
  { label: "#", width: "1.5rem", align: "right" },
  { label: "Name", width: "minmax(0,12rem)" },
  { label: "Description", width: "minmax(0,1fr)" },
  { label: "Difficulty", width: "5rem", align: "right" },
  { label: "Players", width: "4rem", align: "right" },
  { label: "Votes", width: "4rem", align: "right" },
  { label: "Done", width: "3rem", align: "center", tooltip: "Mark as completed" },
  { label: "Status", width: "auto", tooltip: "Who selected or completed this badge this session" },
];

interface SessionMember {
  id: string;
  displayName: string;
  rankColor: string | null;
}

interface GhostMember {
  id: string;
  displayName: string;
}

interface Selection {
  id: string;
  badgeId: string;
  badgeName: string;
  badgeNumber: number;
  badgeDescription: string;
  isPerVisit: boolean;
  selectedBy: { id: string; displayName: string };
}

interface SessionData {
  id: string;
  title: string | null;
  status: string;
  sessionDateLocal: string;
  sessionDateDisplay: string;
  sessionDateLA: string;
  expiresAt: string;
  completedAt: string | null;
  createdBy: { id: string; displayName: string };
  completedBy: { id: string; displayName: string } | null;
  members: SessionMember[];
  ghostMembers: GhostMember[];
  selections: Selection[];
  userAck: { needsReview: boolean; acknowledgedAt: string | null } | null;
}

interface BadgeData {
  id: string;
  badgeNumber: number;
  name: string;
  description: string;
  playerCountBucket: string;
  defaultDifficulty: string;
  isPerVisit: boolean;
  isMetaBadge: boolean;
  rooms: string[];
  games: string[];
  memberCompletions: string[];
  communityVotes: string[];
  currentUserPlayerCount: string | null;
  communityPlayerCountVotes: string[];
  isTodoByCurrentUser: boolean;
}

interface AvailableUser {
  id: string;
  displayName: string;
}

interface Props {
  session: SessionData;
  allBadges: BadgeData[];
  currentUserId: string;
  currentUserRole: string;
  isMember: boolean;
  availableUsersForAdd: AvailableUser[];
  metaRuleBlurbs: Record<string, string>;
  todayString: string;
  sessionCompletedBadgeIds: string[];
  allSessionCompletions: { userId: string; badgeId: string }[];
}

type TabMode = "your_badges" | "group_badges";

const DIFFICULTY_MAP: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };

const SESSION_SORT_FIELDS: SortField[] = [
  { value: "need", label: "Need (others)" },
  { value: "todo", label: "To Do" },
  { value: "difficulty", label: "Difficulty" },
  { value: "name", label: "Name" },
  { value: "players", label: "Player count" },
];

const SESSION_FILTER_DEFS: FilterDefinition[] = [
  { key: "difficulty", label: "Difficulty", options: [
    { value: "all", label: "Any difficulty" },
    { value: "easy", label: "Easy" },
    { value: "medium", label: "Medium" },
    { value: "hard", label: "Hard" },
    { value: "impossible", label: "Impossible" },
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
const DIFFICULTY_LABELS: Record<string, { label: string; color: string }> = {
  easy: { label: "Easy", color: "text-green-400" },
  medium: { label: "Medium", color: "text-yellow-400" },
  hard: { label: "Hard", color: "text-orange-400" },
  impossible: { label: "Impossible", color: "text-red-400" },
  unknown: { label: "???", color: "text-muted" },
};

function playerCountLabel(bucket: string): string {
  if (bucket === "lte_3") return "≤3";
  if (bucket === "gte_5") return "5+";
  return "Any";
}

function resolvePlayerCount(badge: BadgeData): { bucket: string; label: string; color: string } {
  const personal = badge.currentUserPlayerCount;
  if (personal && personal !== "none") {
    return {
      bucket: personal,
      label: playerCountLabel(personal),
      color: personal === "lte_3" ? "text-blue-400" : personal === "gte_5" ? "text-orange-400" : "text-muted",
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
      };
    }
  }

  const fallback = badge.playerCountBucket;
  return {
    bucket: fallback,
    label: playerCountLabel(fallback),
    color: fallback === "lte_3" ? "text-blue-400" : fallback === "gte_5" ? "text-orange-400" : "text-muted",
  };
}

export function SessionDetailClient({
  session,
  allBadges,
  currentUserId,
  currentUserRole,
  isMember: initialIsMember,
  availableUsersForAdd,
  metaRuleBlurbs,
  todayString,
  sessionCompletedBadgeIds,
  allSessionCompletions,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const personallyDone =
    session.status === "closed" ||
    (session.status === "completed_pending_ack" && session.userAck && !session.userAck.needsReview);

  // Past the 6am-next-day LA cutoff → edit mode. Before it → re-open to active.
  // expiresAt is already set to 6am the day after the session date.
  const isPastDate = Date.now() > new Date(session.expiresAt).getTime();

  // Future = active status but session date hasn't arrived yet.
  const isFuture = session.status === "active" && session.sessionDateLA > todayString;

  // Temporary client-side edit mode for past-date closed sessions.
  // Not persisted — leaving the page reverts to the closed view.
  const [isEditing, setIsEditing] = useState(false);
  const effectivelyActive = session.status === "active" || isEditing;
  // Editing is allowed when: active, in review (completed_pending_ack + needsReview), or in client edit mode.
  // Closed (personallyDone + not editing) = read-only.
  const canEdit = !personallyDone || isEditing;
  const showYourBadges = initialIsMember && !personallyDone && session.status === "active";

  const [activeTab, setActiveTab] = usePersistedState<TabMode>("bh:session:tab", showYourBadges ? "your_badges" : "group_badges");

  // When showYourBadges turns off (e.g. session completed), fall back to group view
  // so the badge list doesn't just vanish.
  const displayTab = showYourBadges ? activeTab : "group_badges";
  const [showJoinPrompt, setShowJoinPrompt] = useState(!initialIsMember);
  const [viewOnlyMode, setViewOnlyMode] = useState(!initialIsMember);
  const [showAddMember, setShowAddMember] = useState(false);
  const [ghostNameInput, setGhostNameInput] = useState("");
  const [editingParty, setEditingParty] = useState(false);

  // Optimistic local tracking of which badges were completed in this session.
  // Seeded from the server prop; updates immediately on toggle so no refresh is needed
  // for the checkbox state itself.
  const [sessionCompletedSet, setSessionCompletedSet] = useState(
    () => new Set(sessionCompletedBadgeIds)
  );

  // badgeId → Set<userId> lookup for ALL members' session completions.
  // The current user's entry is overridden by sessionCompletedSet for optimistic accuracy.
  const sessionCompletionsByBadge = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const { userId, badgeId } of allSessionCompletions) {
      if (!map.has(badgeId)) map.set(badgeId, new Set());
      map.get(badgeId)!.add(userId);
    }
    return map;
  }, [allSessionCompletions]);

  // When the user unchecks a Done box, we prompt whether to also un-complete persistently.
  const [uncompletConfirm, setUncompletConfirm] = useState<{ badgeId: string; badgeName: string } | null>(null);

  function handleSessionCompletion(badgeId: string, badgeName: string) {
    if (!canEdit) return;
    if (sessionCompletedSet.has(badgeId)) {
      // Prompt before removing — unchecking has two possible meanings.
      setUncompletConfirm({ badgeId, badgeName });
    } else {
      // Optimistically mark as done in this session + persist to account.
      setSessionCompletedSet((prev) => new Set([...prev, badgeId]));
      toggleSessionBadgeCompletion(session.id, badgeId, false);
    }
  }

  function handleUncompletConfirm(alsoUncompletePersistently: boolean) {
    if (!uncompletConfirm) return;
    const { badgeId } = uncompletConfirm;
    setSessionCompletedSet((prev) => {
      const next = new Set(prev);
      next.delete(badgeId);
      return next;
    });
    toggleSessionBadgeCompletion(session.id, badgeId, alsoUncompletePersistently);
    setUncompletConfirm(null);
  }

  // Brief hover suppression after badge selection causes list reorder
  const [suppressHover, setSuppressHover] = useState(false);
  const handleBadgeSelect = useCallback((badgeId: string) => {
    setSuppressHover(true);
    toggleBadgeSelection(session.id, badgeId);
  }, [session.id]);
  useEffect(() => {
    if (!suppressHover) return;
    const handler = () => setSuppressHover(false);
    window.addEventListener("mousemove", handler, { once: true });
    return () => window.removeEventListener("mousemove", handler);
  }, [suppressHover]);

  const [yourBadgesSearch, setYourBadgesSearch] = usePersistedState("bh:session:your-badges:search", "");
  const [yourBadgesFilters, setYourBadgesFilters] = usePersistedState<ActiveFilter[]>("bh:session:your-badges:filters", []);
  const [yourBadgesSortCriteria, setYourBadgesSortCriteria] = usePersistedState<SortCriterion[]>("bh:session:your-badges:sort", [
    { field: "need", ascending: false },
    { field: "todo", ascending: false },
    { field: "difficulty", ascending: true },
  ]);

  const displayPartySize = session.members.length + session.ghostMembers.length;
  const allRealMemberIds = session.members.map((member) => member.id);
  const otherRealMemberIds = allRealMemberIds.filter((memberId) => memberId !== currentUserId);

  function handleAction(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  function handleJoinSession() {
    handleAction(async () => {
      await joinSession(session.id);
      setShowJoinPrompt(false);
      setViewOnlyMode(false);
    });
  }

  function handleViewOnly() {
    setShowJoinPrompt(false);
  }

  function handleAddMember(userId: string) {
    handleAction(async () => {
      await addSessionMember(session.id, userId);
      setShowAddMember(false);
    });
  }

  function handleRemoveMember(userId: string) {
    handleAction(() => removeSessionMember(session.id, userId));
  }

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  function handleLeaveSession() {
    setShowLeaveConfirm(true);
  }

  function confirmLeave() {
    setShowLeaveConfirm(false);
    startTransition(async () => {
      await removeSessionMember(session.id, currentUserId);
      setViewOnlyMode(true);
      setShowJoinPrompt(true);
      router.refresh();
    });
  }

  function handleRemoveGhost(ghostId: string) {
    handleAction(() => removeGhostMember(ghostId));
  }

  function handleAddGhost() {
    const name = ghostNameInput.trim();
    if (!name) return;
    handleAction(async () => {
      await addGhostMember(session.id, name);
      setGhostNameInput("");
    });
  }

  const userSelectedBadgeIds = useMemo(() => new Set(
    session.selections.filter((selection) => selection.selectedBy.id === currentUserId).map((selection) => selection.badgeId)
  ), [session.selections, currentUserId]);

  const yourBadgesList = useMemo(() => {
    if (viewOnlyMode) return [];

    let list = allBadges
      .map((badge) => {
        const totalUncompletedCount = allRealMemberIds.filter(
          (memberId) => !badge.memberCompletions.includes(memberId)
        ).length;
        const difficultySortKey = DIFFICULTY_MAP[badge.defaultDifficulty] ?? 99;
        return { ...badge, totalUncompletedCount, difficultySortKey };
      });

    if (yourBadgesSearch) {
      const query = yourBadgesSearch.toLowerCase();
      list = list.filter((badge) =>
        badge.name.toLowerCase().includes(query) || badge.description.toLowerCase().includes(query) || badge.badgeNumber.toString().includes(query)
      );
    }

    const difficultyVal = yourBadgesFilters.find((filter) => filter.key === "difficulty")?.value ?? "all";
    const playersVal = yourBadgesFilters.find((filter) => filter.key === "players")?.value ?? "all";
    const typeVal = yourBadgesFilters.find((filter) => filter.key === "type")?.value ?? "all";

    if (difficultyVal !== "all") list = list.filter((badge) => badge.defaultDifficulty === difficultyVal);
    if (playersVal !== "all") list = list.filter((badge) => resolvePlayerCount(badge).bucket === playersVal);
    if (typeVal === "per_visit") list = list.filter((badge) => badge.isPerVisit);
    else if (typeVal === "normal") list = list.filter((badge) => !badge.isPerVisit);

    list.sort((badgeA, badgeB) => {
      // Selected badges always bubble to the top
      const aSelected = userSelectedBadgeIds.has(badgeA.id) ? 0 : 1;
      const bSelected = userSelectedBadgeIds.has(badgeB.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;

      for (const criterion of yourBadgesSortCriteria) {
        let comparison = 0;
        switch (criterion.field) {
          case "need": comparison = badgeA.totalUncompletedCount - badgeB.totalUncompletedCount; break;
          case "todo": comparison = (badgeA.isTodoByCurrentUser ? 1 : 0) - (badgeB.isTodoByCurrentUser ? 1 : 0); break;
          case "difficulty": comparison = badgeA.difficultySortKey - badgeB.difficultySortKey; break;
          case "name": comparison = badgeA.name.localeCompare(badgeB.name); break;
          case "players": comparison = (resolvePlayerCount(badgeA) as { bucket: string }).bucket.localeCompare(resolvePlayerCount(badgeB).bucket); break;
        }
        if (comparison !== 0) return criterion.ascending ? comparison : -comparison;
      }
      return badgeA.badgeNumber - badgeB.badgeNumber;
    });

    return list;
  }, [allBadges, currentUserId, allRealMemberIds, viewOnlyMode, yourBadgesSearch, yourBadgesFilters, yourBadgesSortCriteria, userSelectedBadgeIds]);


  const badgeLookup = useMemo(() => {
    const lookup = new Map<string, BadgeData>();
    for (const badge of allBadges) lookup.set(badge.id, badge);
    return lookup;
  }, [allBadges]);

  const groupBadges = useMemo(() => {
    const badgeMap = new Map<string, { selection: Selection; selectors: { id: string; displayName: string }[] }>();
    for (const selection of session.selections) {
      const existing = badgeMap.get(selection.badgeId);
      if (existing) existing.selectors.push(selection.selectedBy);
      else badgeMap.set(selection.badgeId, { selection, selectors: [selection.selectedBy] });
    }
    return Array.from(badgeMap.values());
  }, [session.selections]);

  const groupPerVisit = groupBadges.filter((entry) => entry.selection.isPerVisit);
  const groupNormal = groupBadges.filter((entry) => !entry.selection.isPerVisit);

  const memberCount = session.members.length;

  return (
    <div className="space-y-6">
      {/* Uncheck confirmation dialog */}
      {uncompletConfirm && (
        <ConfirmDialog
          title={`Uncheck \u201c${uncompletConfirm.badgeName}\u201d?`}
          description="Do you also want to remove this badge from your account\u2019s completed list?"
          onClose={() => setUncompletConfirm(null)}
          actions={[
            { label: "Yes, un-complete on my account too", onClick: () => handleUncompletConfirm(true), variant: "danger" },
            { label: "Just uncheck in this session", onClick: () => handleUncompletConfirm(false) },
            { label: "Cancel", onClick: () => setUncompletConfirm(null), variant: "muted" },
          ]}
        />
      )}

      {/* Leave session confirmation dialog */}
      {showLeaveConfirm && (
        <ConfirmDialog
          title="Leave this session?"
          description="Your badge selections will be removed."
          onClose={() => setShowLeaveConfirm(false)}
          actions={[
            { label: "Yes, leave session", onClick: confirmLeave, variant: "danger" },
            { label: "Cancel", onClick: () => setShowLeaveConfirm(false), variant: "muted" },
          ]}
        />
      )}
      {/* Join prompt for non-members */}
      {showJoinPrompt && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-6 text-center">
          <p className="text-sm text-foreground">
            {session.status !== "active"
              ? "You weren't in this session."
              : "You're not a member of this session."}
          </p>
          <div className="mt-3 flex justify-center gap-3">
            {session.status === "active" && (
              <button
                onClick={handleJoinSession}
                disabled={isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isPending ? "Joining..." : "Join Session"}
              </button>
            )}
            <button
              onClick={handleViewOnly}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              View Only
            </button>
          </div>
        </div>
      )}

      <BackButton fallback="/sessions" label="Sessions" />

      {/* Session header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {session.title ?? session.sessionDateDisplay}
              {" "}
              <span className="text-sm font-normal text-muted">(Created by {session.createdBy.displayName})</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {viewOnlyMode && !showJoinPrompt && (
              <span className="rounded-full bg-border px-3 py-1 text-xs font-medium text-muted">Viewing</span>
            )}
            {(() => {
              const label = isEditing ? "Editing"
                : session.status === "active"
                  ? (isFuture ? "Future" : "Active")
                  : personallyDone ? "Closed"
                  : session.status === "completed_pending_ack" ? "Review Pending"
                  : "Closed";
              const colorClass = isEditing ? "bg-accent/20 text-accent"
                : isFuture ? "bg-blue-500/20 text-blue-400"
                : session.status === "active" ? "bg-success/20 text-success"
                : session.status === "completed_pending_ack" ? "bg-warning/20 text-warning"
                : "bg-border text-muted";
              return <span className={`rounded-full px-3 py-1 text-xs font-medium ${colorClass}`}>{label}</span>;
            })()}
            
          </div>
        </div>

        {/* Party members — linked to profiles */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {session.members.map((member) => (
            <Link
              key={member.id}
              href={`/players/${member.id}?from=${encodeURIComponent(`/sessions/${session.id}`)}`}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium hover:opacity-80 transition-opacity ${
                member.id === currentUserId ? "bg-accent/20 text-accent" : "bg-border text-foreground"
              }`}
            >
              {member.displayName}
              {member.rankColor && <span className="text-[10px] text-muted">({member.rankColor})</span>}
              {editingParty && member.id !== currentUserId && (
                <button onClick={(event) => { event.preventDefault(); handleRemoveMember(member.id); }} disabled={isPending} className="ml-0.5 text-danger/60 hover:text-danger" title="Remove">×</button>
              )}
            </Link>
          ))}
          {session.ghostMembers.map((ghost) => (
            <span key={ghost.id} className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
              {ghost.displayName}
              {editingParty && (
                <button onClick={() => handleRemoveGhost(ghost.id)} disabled={isPending} className="ml-0.5 text-danger/60 hover:text-danger" title="Remove">×</button>
              )}
            </span>
          ))}
          <span className="text-xs text-muted">= {displayPartySize} total</span>

          {!viewOnlyMode && effectivelyActive && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowAddMember(!showAddMember)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:text-foreground transition-colors"
              >
                + Add
              </button>
              <button
                onClick={() => setEditingParty(!editingParty)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  editingParty ? "border-danger/30 text-danger" : "border-border text-muted hover:text-foreground"
                }`}
              >
                {editingParty ? "Done" : "Edit"}
              </button>
              <button
                onClick={handleLeaveSession}
                disabled={isPending}
                className="rounded-full border border-danger/30 px-3 py-1 text-xs text-danger/60 hover:text-danger transition-colors"
              >
                Leave
              </button>
            </div>
          )}

          {/* Active session: "Review and Complete" — not available for future sessions */}
          {session.status === "active" && !isFuture && !viewOnlyMode && (
            <button
              onClick={() => handleAction(() => completeSession(session.id))}
              disabled={isPending}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-highlight to-pink-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_14px_rgba(217,70,239,0.25)] transition-all hover:shadow-[0_0_20px_rgba(217,70,239,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {isPending ? "Completing..." : "Review and Complete"}
            </button>
          )}

          {/* Edit mode (past-date): "Done Editing" exits back to closed view */}
          {isEditing && !viewOnlyMode && (
            <button
              onClick={() => setIsEditing(false)}
              className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-highlight to-pink-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_14px_rgba(217,70,239,0.25)] transition-all hover:shadow-[0_0_20px_rgba(217,70,239,0.4)] hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Done Editing
            </button>
          )}

          {/* Closed/acked: "Re-open" (current day) or "Edit" (past day) */}
          {personallyDone && !isEditing && initialIsMember && !viewOnlyMode && (
            <button
              onClick={() => {
                if (isPastDate) {
                  setIsEditing(true);
                } else {
                  handleAction(() => reopenSession(session.id));
                }
              }}
              disabled={isPending}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-5 py-2.5 text-sm font-medium text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {isPastDate ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                )}
              </svg>
              {isPending ? "Reopening..." : isPastDate ? "Edit" : "Re-open"}
            </button>
          )}
        </div>

        {/* Add member / ghost panel */}
        {showAddMember && !viewOnlyMode && effectivelyActive && (
          <div className="mt-2 space-y-2">
            {availableUsersForAdd.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {availableUsersForAdd.map((appUser) => (
                  <button
                    key={appUser.id}
                    onClick={() => handleAddMember(appUser.id)}
                    disabled={isPending}
                    className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-xs text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                  >
                    + {appUser.displayName}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ghostNameInput}
                onChange={(event) => setGhostNameInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") handleAddGhost(); }}
                placeholder="Add non-member player..."
                className="w-48 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleAddGhost}
                disabled={isPending || !ghostNameInput.trim()}
                className="rounded-lg bg-warning/20 px-3 py-1.5 text-xs font-medium text-warning hover:bg-warning/30 transition-colors disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}

        

        {/* Review prompt — uses handleAction to force refresh */}
        {session.status === "completed_pending_ack" && session.userAck?.needsReview && !viewOnlyMode && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="text-sm text-warning">
              {session.completedBy?.displayName} has completed this session. Review your badge completions?
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                onClick={() => handleAction(() => acknowledgeSession(session.id))}
                disabled={isPending}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isPending ? "Updating..." : "I have checked off all completed badges"}
              </button>
              <button
                onClick={() => handleAction(() => cancelSessionReview(session.id))}
                disabled={isPending}
                className="cursor-pointer rounded-lg border border-danger/30 bg-danger/10 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/20 hover:border-danger/50 transition-colors disabled:opacity-50"
              >
                Cancel Review
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instruction box with animated switch button */}
      {showYourBadges && (
        <div className="grid grid-cols-2 items-center gap-4 rounded-xl border border-highlight/20 bg-highlight/[0.06] px-6 py-4">
          {activeTab === "your_badges" ? (
            <>
              <div>
                <p className="text-xl font-bold text-foreground">Pick your badges!</p>
                <p className="mt-1 text-sm text-highlight-hover">Tap any badge below to add it to your goals for this visit.</p>
              </div>
              <button
                onClick={() => setActiveTab("group_badges")}
                className="btn-glow group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-highlight to-pink-500 px-7 py-3.5 text-lg font-extrabold text-white transition-all"
              >
                Group Goals
                {session.selections.length > 0 && (
                  <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-bold">{session.selections.length}</span>
                )}
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setActiveTab("your_badges")}
                className="btn-glow group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-pink-500 to-highlight px-7 py-3.5 text-lg font-extrabold text-white transition-all"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                Select Badges
              </button>
              <div className="text-right">
                <p className="text-xl font-bold text-foreground">Group Goals</p>
                <p className="mt-1 text-sm text-highlight-hover">Everyone&apos;s picks combined. Select badges to add yours!</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Your Badges tab ── */}
      {displayTab === "your_badges" && showYourBadges && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <MultiFilter
              definitions={SESSION_FILTER_DEFS}
              activeFilters={yourBadgesFilters}
              onChange={setYourBadgesFilters}
              searchValue={yourBadgesSearch}
              onSearchChange={setYourBadgesSearch}
              searchPlaceholder="Search badges..."
            />
            <div className="ml-auto">
              <MultiSort availableFields={SESSION_SORT_FIELDS} criteria={yourBadgesSortCriteria} onChange={setYourBadgesSortCriteria} />
            </div>
          </div>

          <p className="text-[10px] text-muted">{yourBadgesList.length} badges</p>

          <BadgeTable
            columns={YOUR_BADGES_COLUMNS}
            sortCriteria={yourBadgesSortCriteria}
            onSortChange={setYourBadgesSortCriteria}
            sections={(() => {
              const buildRow = (badge: typeof yourBadgesList[number]): BadgeTableRow => {
                const isSelected = userSelectedBadgeIds.has(badge.id);
                const isSessionCompleted = sessionCompletedSet.has(badge.id);
                const diffInfo = DIFFICULTY_LABELS[badge.defaultDifficulty] ?? DIFFICULTY_LABELS.unknown;
                const blurb = metaRuleBlurbs[badge.id];
                const rowClassName = isSessionCompleted
                  ? "bg-completed hover:bg-completed-hover"
                  : isSelected
                    ? (suppressHover ? "bg-selection" : "bg-selection hover:bg-selection-hover")
                    : "hover:bg-card-hover";
                return {
                  key: badge.id,
                  className: rowClassName,
                  onMouseDown: () => handleBadgeSelect(badge.id),
                  cells: [
                    <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{badge.badgeNumber}</span>,
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium text-foreground">{badge.name}</span>
                      <Link
                        href={`/badges/${badge.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="shrink-0 text-muted hover:text-accent transition-colors"
                        title="Badge info"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </Link>
                      {badge.isPerVisit && <span className="shrink-0 rounded bg-accent/20 px-1 py-px text-[9px] font-medium text-accent">visit</span>}
                      {badge.isMetaBadge && <span className="shrink-0 rounded bg-purple-500/20 px-1 py-px text-[9px] font-medium text-purple-400">meta</span>}
                    </div>,
                    <span className="block min-w-0 truncate text-xs text-muted">{badge.description}</span>,
                    <span className={`min-w-0 text-center text-[11px] font-medium ${diffInfo.color}`}>{diffInfo.label}</span>,
                    <span className={`min-w-0 text-center text-[11px] ${resolvePlayerCount(badge).color}`}>{resolvePlayerCount(badge).label}</span>,
                    <span className="min-w-0 text-center text-[11px] text-success">{badge.totalUncompletedCount}/{memberCount}</span>,
                    <span
                      className={`min-w-0 flex items-center justify-center text-[13px] ${badge.isTodoByCurrentUser ? "text-amber-400" : "text-border"}`}
                      title={badge.isTodoByCurrentUser ? "On your To Do list" : "Not on your To Do list"}
                    >
                      ★
                    </span>,
                  ],
                  footer: undefined,
                };
              };
              const perVisit = yourBadgesList.filter((badge) => badge.isPerVisit);
              const standard = yourBadgesList.filter((badge) => !badge.isPerVisit);
              return [
                ...(perVisit.length > 0 ? [{ label: "Per-Visit Badges", rows: perVisit.map(buildRow) }] : []),
                ...(standard.length > 0 ? [{ label: "Standard Badges", rows: standard.map(buildRow) }] : []),
              ];
            })()}
            emptyState={
              <div className="py-8 text-center text-muted">
                <p className="text-sm">No badges match your filters.</p>
              </div>
            }
          />
        </div>
      )}

      {/* ── Group Badges tab ── */}
      {displayTab === "group_badges" && (
        <div className="space-y-4">
          {session.selections.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-muted">No badges selected yet.</p>
              {!viewOnlyMode && <p className="mt-1 text-sm text-muted">Use the button above to select badges for this session.</p>}
            </div>
          ) : (
            <BadgeTable
              columns={GROUP_BADGES_COLUMNS}
              sections={[
                ...(groupPerVisit.length > 0
                  ? [{ label: "Per-Visit Badges", rows: buildGroupBadgeRows(groupPerVisit, badgeLookup, currentUserId, metaRuleBlurbs, userSelectedBadgeIds, sessionCompletedSet, canEdit, handleSessionCompletion, sessionCompletionsByBadge, session.members) } satisfies BadgeTableSection]
                  : []),
                ...(groupNormal.length > 0
                  ? [{ label: "Standard Badges", rows: buildGroupBadgeRows(groupNormal, badgeLookup, currentUserId, metaRuleBlurbs, userSelectedBadgeIds, sessionCompletedSet, canEdit, handleSessionCompletion, sessionCompletionsByBadge, session.members) } satisfies BadgeTableSection]
                  : []),
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Group Badges row builder ─── */

function buildGroupBadgeRows(
  entries: { selection: Selection; selectors: { id: string; displayName: string }[] }[],
  badgeLookup: Map<string, BadgeData>,
  currentUserId: string,
  metaRuleBlurbs: Record<string, string>,
  userSelectedBadgeIds: Set<string>,
  sessionCompletedSet: Set<string>,
  canEdit: boolean,
  onSessionCompletion: (badgeId: string, badgeName: string) => void,
  sessionCompletionsByBadge: Map<string, Set<string>>,
  members: { id: string; displayName: string }[],
): BadgeTableRow[] {
  return entries.map((entry) => {
    const fullBadge = badgeLookup.get(entry.selection.badgeId);
    const diffKey = fullBadge?.defaultDifficulty ?? "unknown";
    const diffInfo = DIFFICULTY_LABELS[diffKey] ?? DIFFICULTY_LABELS.unknown;
    const playerCountResolved = fullBadge ? resolvePlayerCount(fullBadge) : { bucket: "none", label: "Any", color: "text-muted" };
    const blurb = metaRuleBlurbs[entry.selection.badgeId];
    const selectorNames = entry.selectors.map((selector) => selector.displayName).join(", ");
    const selectorCount = entry.selectors.length;
    const isSessionCompleted = sessionCompletedSet.has(entry.selection.badgeId);
    const isUserSelected = userSelectedBadgeIds.has(entry.selection.badgeId);
    // Green = completed in this session. Blue = selected by you. Green takes priority.
    const rowClassName = isSessionCompleted
      ? "bg-completed hover:bg-completed-hover"
      : isUserSelected
        ? "bg-selection hover:bg-selection-hover"
        : "hover:bg-card-hover";

    // Build per-player status chips.
    // Server-side completions, with the current user overridden by optimistic sessionCompletedSet.
    const serverCompletedIds = sessionCompletionsByBadge.get(entry.selection.badgeId) ?? new Set<string>();
    const selectorIds = new Set(entry.selectors.map((selector) => selector.id));

    // Collect all user IDs that should appear: selectors + anyone who completed it in-session.
    const relevantIds = new Set<string>([...selectorIds]);
    for (const uid of serverCompletedIds) relevantIds.add(uid);
    // Apply optimistic current-user override.
    if (isSessionCompleted) relevantIds.add(currentUserId);

    // Build display name lookup from members list (selectors already have displayName).
    const memberNameById = new Map(members.map((member) => [member.id, member.displayName]));
    for (const selector of entry.selectors) memberNameById.set(selector.id, selector.displayName);

    const playerStatusChips = Array.from(relevantIds).map((uid) => {
      // Current user's completion state comes from optimistic sessionCompletedSet.
      const completed = uid === currentUserId
        ? sessionCompletedSet.has(entry.selection.badgeId)
        : serverCompletedIds.has(uid);
      const name = memberNameById.get(uid) ?? "Unknown";
      return (
        <span
          key={uid}
          className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
            completed ? "text-success" : "text-accent"
          }`}
          title={completed ? `${name} completed in this session` : `${name} selected this badge`}
        >
          {name}
          {completed ? " ✓" : " ◐"}
        </span>
      );
    });

    return {
      key: entry.selection.badgeId,
      className: rowClassName,
      cells: [
        <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{entry.selection.badgeNumber}</span>,
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-foreground">{entry.selection.badgeName}</span>
          <Link
            href={`/badges/${entry.selection.badgeId}`}
            className="shrink-0 text-muted hover:text-accent transition-colors"
            title="Badge info"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Link>
          {entry.selection.isPerVisit && <span className="shrink-0 rounded bg-accent/20 px-1 py-px text-[9px] font-medium text-accent">visit</span>}
          {fullBadge?.isMetaBadge && <span className="shrink-0 rounded bg-purple-500/20 px-1 py-px text-[9px] font-medium text-purple-400">meta</span>}
        </div>,
        <span className="block min-w-0 truncate text-xs text-muted">{entry.selection.badgeDescription}</span>,
        <span className={`min-w-0 text-center text-[11px] font-medium ${diffInfo.color}`}>{diffInfo.label}</span>,
        <span className={`min-w-0 text-center text-[11px] ${playerCountResolved.color}`}>{playerCountResolved.label}</span>,
        <span className="min-w-0 text-center text-[11px] text-success" title={selectorNames}>{selectorCount}</span>,
        <BadgeCheckbox
          checked={isSessionCompleted}
          disabled={!canEdit}
          title={!canEdit ? "Session is closed" : isSessionCompleted ? "Completed this session — click to undo" : "Mark completed in this session"}
          onClick={() => onSessionCompletion(entry.selection.badgeId, entry.selection.badgeName)}
        />,
        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5">
          {playerStatusChips.length > 0 ? playerStatusChips : (
            <span className="text-[11px] text-muted">—</span>
          )}
        </div>,
      ],
      footer: undefined,
    };
  });
}
