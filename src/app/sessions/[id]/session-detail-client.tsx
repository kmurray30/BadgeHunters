"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  toggleBadgeSelection,
  completeSession,
  acknowledgeSession,
  addSessionMember,
  joinSession,
  addGhostMember,
  removeSessionMember,
  removeGhostMember,
} from "@/app/actions/sessions";
import { toggleBadgeCompletion } from "@/app/actions/badges";
import { BackButton } from "@/components/back-button";

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
type RecommendationFilter = "best" | "broader" | "all";
type YourBadgesSortOption = "relevance" | "number" | "name" | "difficulty";

const DIFFICULTY_MAP: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };
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
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>("best");
  const [showJoinPrompt, setShowJoinPrompt] = useState(!initialIsMember);
  const [viewOnlyMode, setViewOnlyMode] = useState(!initialIsMember);
  const [showAddMember, setShowAddMember] = useState(false);
  const [ghostNameInput, setGhostNameInput] = useState("");
  const [editingParty, setEditingParty] = useState(false);

  const [yourBadgesSort, setYourBadgesSort] = useState<YourBadgesSortOption>("relevance");
  const [yourBadgesSortAsc, setYourBadgesSortAsc] = useState(true);
  const [yourBadgesSearch, setYourBadgesSearch] = useState("");
  const [yourBadgesDifficulty, setYourBadgesDifficulty] = useState<string>("all");
  const [yourBadgesPlayerCount, setYourBadgesPlayerCount] = useState<string>("all");
  const [yourBadgesType, setYourBadgesType] = useState<"all" | "per_visit" | "normal">("all");

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

  const recommendedBadges = useMemo(() => {
    if (viewOnlyMode) return [];
    const viewerUncompletedBadges = allBadges.filter(
      (badge) => !badge.memberCompletions.includes(currentUserId)
    );

    return viewerUncompletedBadges.map((badge) => {
      const otherUncompletedCount = otherRealMemberIds.filter(
        (memberId) => !badge.memberCompletions.includes(memberId)
      ).length;

      let sharedScore = 0;
      if (displayPartySize <= 5) {
        if (otherUncompletedCount === otherRealMemberIds.length) sharedScore = 3;
        else if (otherUncompletedCount > 0) sharedScore = 1;
      } else {
        if (otherUncompletedCount >= 4) sharedScore = 3;
        else if (otherUncompletedCount >= 1) sharedScore = 1;
      }

      let bucketBoost = 0;
      const resolvedBucket = resolvePlayerCount(badge).bucket;
      if (resolvedBucket === "gte_5" && displayPartySize >= 5) bucketBoost = 1;
      else if (resolvedBucket === "lte_3" && displayPartySize <= 3) bucketBoost = 1;
      else if (resolvedBucket === "gte_5" && displayPartySize < 5) bucketBoost = -1;

      const difficultySortKey = DIFFICULTY_MAP[badge.defaultDifficulty] ?? 99;

      return {
        ...badge,
        otherUncompletedCount,
        sharedScore,
        bucketBoost,
        difficultySortKey,
        sortScore: sharedScore * 100 + otherUncompletedCount * 10 + bucketBoost * 5 - difficultySortKey,
      };
    }).sort((badgeA, badgeB) => badgeB.sortScore - badgeA.sortScore);
  }, [allBadges, currentUserId, otherRealMemberIds, displayPartySize, viewOnlyMode]);

  const filteredRecommendations = useMemo(() => {
    let list = recommendedBadges;
    switch (recommendationFilter) {
      case "best": list = list.filter((badge) => badge.sharedScore >= 3); break;
      case "broader": list = list.filter((badge) => badge.sharedScore >= 1); break;
    }
    if (yourBadgesSearch) {
      const query = yourBadgesSearch.toLowerCase();
      list = list.filter((badge) =>
        badge.name.toLowerCase().includes(query) || badge.description.toLowerCase().includes(query) || badge.badgeNumber.toString().includes(query)
      );
    }
    if (yourBadgesDifficulty !== "all") list = list.filter((badge) => badge.defaultDifficulty === yourBadgesDifficulty);
    if (yourBadgesPlayerCount !== "all") list = list.filter((badge) => resolvePlayerCount(badge).bucket === yourBadgesPlayerCount);
    if (yourBadgesType === "per_visit") list = list.filter((badge) => badge.isPerVisit);
    else if (yourBadgesType === "normal") list = list.filter((badge) => !badge.isPerVisit);
    if (yourBadgesSort !== "relevance") {
      const sorted = [...list];
      sorted.sort((badgeA, badgeB) => {
        let comparison = 0;
        switch (yourBadgesSort) {
          case "number": comparison = badgeA.badgeNumber - badgeB.badgeNumber; break;
          case "name": comparison = badgeA.name.localeCompare(badgeB.name); break;
          case "difficulty": comparison = badgeA.difficultySortKey - badgeB.difficultySortKey; break;
        }
        return yourBadgesSortAsc ? comparison : -comparison;
      });
      return sorted;
    }
    return list;
  }, [recommendedBadges, recommendationFilter, yourBadgesSearch, yourBadgesDifficulty, yourBadgesPlayerCount, yourBadgesType, yourBadgesSort, yourBadgesSortAsc]);

  const userSelectedBadgeIds = new Set(
    session.selections.filter((selection) => selection.selectedBy.id === currentUserId).map((selection) => selection.badgeId)
  );

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

  function handleYourBadgesSortToggle(option: YourBadgesSortOption) {
    if (yourBadgesSort === option) setYourBadgesSortAsc(!yourBadgesSortAsc);
    else { setYourBadgesSort(option); setYourBadgesSortAsc(true); }
  }

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
            {session.status === "active" && !viewOnlyMode && (
              <button
                onClick={() => handleAction(() => completeSession(session.id))}
                disabled={isPending}
                className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning hover:bg-warning/25 hover:border-warning/60 transition-colors disabled:opacity-50"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Complete
              </button>
            )}
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
            <button
              onClick={() => handleAction(() => acknowledgeSession(session.id))}
              disabled={isPending}
              className="mt-2 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isPending ? "Updating..." : "Mark Reviewed"}
            </button>
          </div>
        )}
      </div>

      {/* Tabs — hide Your Badges tab when closed or view-only */}
      {showYourBadges && (
        <div className="flex gap-1 rounded-lg bg-card p-1 border border-border">
          <button
            onClick={() => setActiveTab("your_badges")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "your_badges" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Your Badges
          </button>
          <button
            onClick={() => setActiveTab("group_badges")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "group_badges" ? "bg-accent text-white" : "text-muted hover:text-foreground"
            }`}
          >
            Group Badges ({session.selections.length})
          </button>
        </div>
      )}

      {/* ── Your Badges tab ── */}
      {activeTab === "your_badges" && showYourBadges && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["best", "broader", "all"] as const).map((filterOption) => (
              <button key={filterOption} onClick={() => setRecommendationFilter(filterOption)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  recommendationFilter === filterOption ? "bg-accent text-white" : "bg-card border border-border text-muted hover:text-foreground"
                }`}>
                {filterOption === "best" && "Best shared candidates"}
                {filterOption === "broader" && "Broader candidates"}
                {filterOption === "all" && "All uncompleted"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input type="text" value={yourBadgesSearch} onChange={(event) => setYourBadgesSearch(event.target.value)} placeholder="Search badges..." className="w-48 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none" />
            <select value={yourBadgesDifficulty} onChange={(event) => setYourBadgesDifficulty(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
              <option value="all">Any difficulty</option>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="impossible">Impossible</option>
            </select>
            <select value={yourBadgesPlayerCount} onChange={(event) => setYourBadgesPlayerCount(event.target.value)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
              <option value="all">Any # players</option><option value="lte_3">≤3 players</option><option value="gte_5">5+ players</option>
            </select>
            <select value={yourBadgesType} onChange={(event) => setYourBadgesType(event.target.value as typeof yourBadgesType)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
              <option value="all">All types</option><option value="per_visit">Per-visit</option><option value="normal">Normal</option>
            </select>
            <div className="ml-auto flex items-center gap-1">
              <span className="text-[10px] text-muted">Sort:</span>
              <select value={yourBadgesSort} onChange={(event) => handleYourBadgesSortToggle(event.target.value as YourBadgesSortOption)} className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none">
                <option value="relevance">Relevance</option><option value="number">Badge #</option><option value="name">Name</option><option value="difficulty">Difficulty</option>
              </select>
              <button onClick={() => setYourBadgesSortAsc(!yourBadgesSortAsc)} className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-muted hover:text-foreground transition-colors">
                {yourBadgesSortAsc ? "↑" : "↓"}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-muted">{filteredRecommendations.length} badges</p>

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
            {filteredRecommendations.map((badge) => {
              const isSelected = userSelectedBadgeIds.has(badge.id);
              const isCompleted = badge.memberCompletions.includes(currentUserId);
              const diffInfo = DIFFICULTY_LABELS[badge.defaultDifficulty] ?? DIFFICULTY_LABELS.unknown;
              const blurb = metaRuleBlurbs[badge.id];
              return (
                <div key={badge.id}>
                  <div
                    onClick={() => toggleBadgeSelection(session.id, badge.id)}
                    className={`group grid cursor-pointer select-none items-center gap-2 px-3 py-2 transition-colors ${
                      isSelected ? "bg-success/20 hover:bg-success/30" : "hover:bg-card-hover"
                    }`}
                    style={{ gridTemplateColumns: SESSION_GRID_COLUMNS }}
                  >
                    <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{badge.badgeNumber}</span>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Link
                        href={`/badges/${badge.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="min-w-0 truncate text-sm font-medium text-foreground hover:text-accent hover:underline"
                      >
                        {badge.name}
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
                        className={`rounded p-0.5 transition-colors ${
                          isCompleted ? "text-success hover:text-success/70" : "text-border hover:text-muted"
                        }`}
                        title={isCompleted ? "Completed — click to undo" : "Mark completed"}
                      >
                        <svg className="h-4 w-4" fill={isCompleted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

          {filteredRecommendations.length === 0 && (
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
              {!viewOnlyMode && <p className="mt-1 text-sm text-muted">Switch to &quot;Your Badges&quot; to select badges for this session.</p>}
            </div>
          ) : (
            <>
              {groupPerVisit.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-accent uppercase tracking-wide">Per-Visit Badges</h3>
                  <GroupBadgesTable entries={groupPerVisit} badgeLookup={badgeLookup} currentUserId={currentUserId} metaRuleBlurbs={metaRuleBlurbs} />
                </div>
              )}
              {groupNormal.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-foreground uppercase tracking-wide">Standard Badges</h3>
                  <GroupBadgesTable entries={groupNormal} badgeLookup={badgeLookup} currentUserId={currentUserId} metaRuleBlurbs={metaRuleBlurbs} />
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
}: {
  entries: { selection: Selection; selectors: { id: string; displayName: string }[] }[];
  badgeLookup: Map<string, BadgeData>;
  currentUserId: string;
  metaRuleBlurbs: Record<string, string>;
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

          return (
            <div key={entry.selection.badgeId}>
              <div className="group grid items-center gap-2 px-3 py-2 transition-colors hover:bg-card-hover" style={{ gridTemplateColumns: SESSION_GRID_COLUMNS }}>
                <span className="w-5 text-[10px] font-mono text-muted tabular-nums">{entry.selection.badgeNumber}</span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <Link
                    href={`/badges/${entry.selection.badgeId}`}
                    className="min-w-0 truncate text-sm font-medium text-foreground hover:text-accent hover:underline"
                  >
                    {entry.selection.badgeName}
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
                    className={`rounded p-0.5 transition-colors ${
                      isCompleted ? "text-success hover:text-success/70" : "text-border hover:text-muted"
                    }`}
                    title={isCompleted ? "Completed — click to undo" : "Mark completed"}
                  >
                    <svg className="h-4 w-4" fill={isCompleted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
