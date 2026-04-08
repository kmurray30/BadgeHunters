"use client";

import { toggleBadgeCompletion } from "@/app/actions/badges";
import {
    acknowledgeSession,
    addGhostMember,
    addSessionMember,
    cancelSessionReview,
    completeSession,
    joinSession,
    removeGhostMember,
    removeSessionMember,
    toggleBadgeSelection,
} from "@/app/actions/sessions";
import { BackButton } from "@/components/back-button";
import { MultiFilter, type ActiveFilter, type FilterDefinition } from "@/components/multi-filter";
import { MultiSort, type SortCriterion, type SortField } from "@/components/multi-sort";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

const SESSION_GRID_COLUMNS = "auto minmax(0,2.5fr) minmax(0,3fr) 5rem 4rem 4rem 3rem";

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
}

type TabMode = "your_badges" | "group_badges";

const DIFFICULTY_MAP: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };

const SESSION_SORT_FIELDS: SortField[] = [
  { value: "need", label: "Need (others)" },
  { value: "difficulty", label: "Difficulty" },
  { value: "number", label: "Badge #" },
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
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const personallyDone =
    session.status === "closed" ||
    (session.status === "completed_pending_ack" && session.userAck && !session.userAck.needsReview);
  const showYourBadges = initialIsMember && !personallyDone && session.status === "active";

  const [activeTab, setActiveTab] = useState<TabMode>(showYourBadges ? "your_badges" : "group_badges");
  const [showJoinPrompt, setShowJoinPrompt] = useState(!initialIsMember);
  const [viewOnlyMode, setViewOnlyMode] = useState(!initialIsMember);
  const [showAddMember, setShowAddMember] = useState(false);
  const [ghostNameInput, setGhostNameInput] = useState("");
  const [editingParty, setEditingParty] = useState(false);

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

  const [yourBadgesSearch, setYourBadgesSearch] = useState("");
  const [yourBadgesFilters, setYourBadgesFilters] = useState<ActiveFilter[]>([]);
  const [yourBadgesSortCriteria, setYourBadgesSortCriteria] = useState<SortCriterion[]>([
    { field: "need", ascending: false },
    { field: "difficulty", ascending: true },
    { field: "number", ascending: true },
  ]);

  const displayPartySize = session.members.length + session.ghostMembers.length;
  const otherRealMemberIds = session.members
    .filter((member) => member.id !== currentUserId)
    .map((member) => member.id);

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
      .filter((badge) => !badge.memberCompletions.includes(currentUserId))
      .map((badge) => {
        const otherUncompletedCount = otherRealMemberIds.filter(
          (memberId) => !badge.memberCompletions.includes(memberId)
        ).length;
        const difficultySortKey = DIFFICULTY_MAP[badge.defaultDifficulty] ?? 99;
        return { ...badge, otherUncompletedCount, difficultySortKey };
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
          case "need": comparison = badgeA.otherUncompletedCount - badgeB.otherUncompletedCount; break;
          case "difficulty": comparison = badgeA.difficultySortKey - badgeB.difficultySortKey; break;
          case "number": comparison = badgeA.badgeNumber - badgeB.badgeNumber; break;
          case "name": comparison = badgeA.name.localeCompare(badgeB.name); break;
          case "players": comparison = (resolvePlayerCount(badgeA) as { bucket: string }).bucket.localeCompare(resolvePlayerCount(badgeB).bucket); break;
        }
        if (comparison !== 0) return criterion.ascending ? comparison : -comparison;
      }
      return 0;
    });

    return list;
  }, [allBadges, currentUserId, otherRealMemberIds, viewOnlyMode, yourBadgesSearch, yourBadgesFilters, yourBadgesSortCriteria, userSelectedBadgeIds]);


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
      {/* Join prompt for non-members */}
      {showJoinPrompt && (
        <div className="rounded-xl border border-accent/30 bg-accent/5 p-6 text-center">
          <p className="text-sm text-foreground">You&apos;re not a member of this session.</p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              onClick={handleJoinSession}
              disabled={isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isPending ? "Joining..." : "Join Session"}
            </button>
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
              {session.title ?? new Date(session.sessionDateLocal).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })}
              {" "}
              <span className="text-sm font-normal text-muted">(Created by {session.createdBy.displayName})</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {viewOnlyMode && !showJoinPrompt && (
              <span className="rounded-full bg-border px-3 py-1 text-xs font-medium text-muted">Viewing</span>
            )}
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              session.status === "active" ? "bg-success/20 text-success"
                : personallyDone ? "bg-border text-muted"
                : session.status === "completed_pending_ack" ? "bg-warning/20 text-warning"
                : "bg-border text-muted"
            }`}>
              {session.status === "active" ? "Active" : personallyDone ? "Closed" : session.status === "completed_pending_ack" ? "Review Pending" : "Closed"}
            </span>
            
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

          {!viewOnlyMode && session.status === "active" && (
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
            </div>
          )}

          {session.status === "active" && !viewOnlyMode && (
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
        </div>

        {/* Add member / ghost panel */}
        {showAddMember && !viewOnlyMode && session.status === "active" && (
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
      {activeTab === "your_badges" && showYourBadges && (
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

          {/* Table header */}
          <div className="rounded-t-lg border border-border bg-card">
            <div className="grid items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: SESSION_GRID_COLUMNS }}>
              <span className="w-5"></span>
              <span>Name</span>
              <span>Description</span>
              <span className="text-center">Difficulty</span>
              <span className="text-center">Players</span>
              <span className="text-center">Need</span>
              <span className="text-center" title="Mark as completed">Done</span>
            </div>
          </div>
          <div className="divide-y divide-border rounded-b-lg border-x border-b border-border">
            {yourBadgesList.map((badge) => {
              const isSelected = userSelectedBadgeIds.has(badge.id);
              const isCompleted = badge.memberCompletions.includes(currentUserId);
              const diffInfo = DIFFICULTY_LABELS[badge.defaultDifficulty] ?? DIFFICULTY_LABELS.unknown;
              const blurb = metaRuleBlurbs[badge.id];
              return (
                <div key={badge.id}>
                  <div
                    onMouseDown={() => handleBadgeSelect(badge.id)}
                    className={`group grid cursor-pointer select-none items-center gap-2 px-3 py-2 transition-colors ${
                      suppressHover
                        ? (isSelected ? "bg-selection" : "")
                        : (isSelected ? "bg-selection hover:bg-selection-hover" : "hover:bg-card-hover")
                    }`}
                    style={{ gridTemplateColumns: SESSION_GRID_COLUMNS }}
                  >
                    <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{badge.badgeNumber}</span>
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
                    </div>
                    <span className="min-w-0 truncate text-xs text-muted">{badge.description}</span>
                    <span className={`min-w-0 text-center text-[11px] font-medium ${diffInfo.color}`}>{diffInfo.label}</span>
                    <span className={`min-w-0 text-center text-[11px] ${resolvePlayerCount(badge).color}`}>{resolvePlayerCount(badge).label}</span>
                    <span className="min-w-0 text-center text-[11px] text-success">{badge.otherUncompletedCount}/{memberCount - 1}</span>
                    {/* Completion toggle — separate from session selection */}
                    <div className="flex justify-center" onClick={(event) => event.stopPropagation()}>
                      <button
                        onClick={() => toggleBadgeCompletion(badge.id)}
                        className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
                          isCompleted ? "border-success bg-success/20 text-success hover:bg-success/30" : "border-border bg-background text-transparent hover:border-muted hover:text-muted"
                        }`}
                        title={isCompleted ? "Completed — click to undo" : "Mark completed"}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {blurb && (
                    <div className="bg-purple-500/5 px-3 py-1 text-[10px] text-purple-400 border-t border-purple-500/10">
                      {blurb}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {yourBadgesList.length === 0 && (
            <div className="py-8 text-center text-muted">
              <p className="text-sm">No badges match your filters.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Group Badges tab ── */}
      {activeTab === "group_badges" && (
        <div className="space-y-4">
          {session.selections.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-muted">No badges selected yet.</p>
              {!viewOnlyMode && <p className="mt-1 text-sm text-muted">Use the button above to select badges for this session.</p>}
            </div>
          ) : (
            <>
              {groupPerVisit.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-accent uppercase tracking-wide">Per-Visit Badges</h3>
                  <GroupBadgesTable entries={groupPerVisit} badgeLookup={badgeLookup} currentUserId={currentUserId} metaRuleBlurbs={metaRuleBlurbs} userSelectedBadgeIds={userSelectedBadgeIds} />
                </div>
              )}
              {groupNormal.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-foreground uppercase tracking-wide">Standard Badges</h3>
                  <GroupBadgesTable entries={groupNormal} badgeLookup={badgeLookup} currentUserId={currentUserId} metaRuleBlurbs={metaRuleBlurbs} userSelectedBadgeIds={userSelectedBadgeIds} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Group Badges table ─── */

function GroupBadgesTable({
  entries,
  badgeLookup,
  currentUserId,
  metaRuleBlurbs,
  userSelectedBadgeIds,
}: {
  entries: { selection: Selection; selectors: { id: string; displayName: string }[] }[];
  badgeLookup: Map<string, BadgeData>;
  currentUserId: string;
  metaRuleBlurbs: Record<string, string>;
  userSelectedBadgeIds: Set<string>;
}) {
  return (
    <>
      <div className="rounded-t-lg border border-border bg-card">
        <div className="grid items-center gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: SESSION_GRID_COLUMNS }}>
          <span className="w-5"></span>
          <span>Name</span>
          <span>Description</span>
          <span className="text-center">Difficulty</span>
          <span className="text-center">Players</span>
          <span className="text-center">Votes</span>
          <span className="text-center" title="Mark as completed">Done</span>
        </div>
      </div>
      <div className="divide-y divide-border rounded-b-lg border-x border-b border-border">
        {entries.map((entry) => {
          const fullBadge = badgeLookup.get(entry.selection.badgeId);
          const diffKey = fullBadge?.defaultDifficulty ?? "unknown";
          const diffInfo = DIFFICULTY_LABELS[diffKey] ?? DIFFICULTY_LABELS.unknown;
          const playerCountResolved = fullBadge ? resolvePlayerCount(fullBadge) : { bucket: "none", label: "Any", color: "text-muted" };
          const blurb = metaRuleBlurbs[entry.selection.badgeId];
          const selectorNames = entry.selectors.map((selector) => selector.displayName).join(", ");
          const selectorCount = entry.selectors.length;
          const isCompleted = fullBadge?.memberCompletions.includes(currentUserId) ?? false;
          const isUserSelected = userSelectedBadgeIds.has(entry.selection.badgeId);

          return (
            <div key={entry.selection.badgeId}>
              <div className={`group grid items-center gap-2 px-3 py-2 transition-colors ${
                isUserSelected ? "bg-selection hover:bg-selection-hover" : "hover:bg-card-hover"
              }`} style={{ gridTemplateColumns: SESSION_GRID_COLUMNS }}>
                <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{entry.selection.badgeNumber}</span>
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
                </div>
                <span className="min-w-0 truncate text-xs text-muted">{entry.selection.badgeDescription}</span>
                <span className={`min-w-0 text-center text-[11px] font-medium ${diffInfo.color}`}>{diffInfo.label}</span>
                <span className={`min-w-0 text-center text-[11px] ${playerCountResolved.color}`}>{playerCountResolved.label}</span>
                <span className="min-w-0 text-center text-[11px] text-success" title={selectorNames}>{selectorCount}</span>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => toggleBadgeCompletion(entry.selection.badgeId)}
                    className={`flex h-6 w-6 items-center justify-center rounded border transition-colors ${
                      isCompleted ? "border-success bg-success/20 text-success hover:bg-success/30" : "border-border bg-background text-transparent hover:border-muted hover:text-muted"
                    }`}
                    title={isCompleted ? "Completed — click to undo" : "Mark completed"}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              </div>
              {blurb && (
                <div className="bg-purple-500/5 px-3 py-1 text-[10px] text-purple-400 border-t border-purple-500/10">
                  {blurb}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
