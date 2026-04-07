"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { toggleBadgeSelection, completeSession, acknowledgeSession } from "@/app/actions/sessions";
import { toggleBadgeCompletion } from "@/app/actions/badges";

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
}

interface Props {
  session: SessionData;
  allBadges: BadgeData[];
  currentUserId: string;
  currentUserRole: string;
}

type TabMode = "your_badges" | "group_badges";
type RecommendationFilter = "best" | "broader" | "all";

export function SessionDetailClient({ session, allBadges, currentUserId, currentUserRole }: Props) {
  const [activeTab, setActiveTab] = useState<TabMode>("your_badges");
  const [recommendationFilter, setRecommendationFilter] = useState<RecommendationFilter>("best");

  const displayPartySize = session.members.length + session.ghostMembers.length;
  const isMember = session.members.some((member) => member.id === currentUserId);
  const otherRealMemberIds = session.members
    .filter((member) => member.id !== currentUserId)
    .map((member) => member.id);

  // "Your badges" recommendation logic per Spec §11
  const recommendedBadges = useMemo(() => {
    const viewerUncompletedBadges = allBadges.filter(
      (badge) => !badge.memberCompletions.includes(currentUserId)
    );

    return viewerUncompletedBadges.map((badge) => {
      // How many other real session members also haven't completed it?
      const otherUncompletedCount = otherRealMemberIds.filter(
        (memberId) => !badge.memberCompletions.includes(memberId)
      ).length;

      // Determine shared-uncompleted condition strength
      let sharedScore = 0;
      if (displayPartySize <= 5) {
        // Strongly prioritize when EVERYONE else also hasn't completed
        if (otherUncompletedCount === otherRealMemberIds.length) {
          sharedScore = 3;
        } else if (otherUncompletedCount > 0) {
          sharedScore = 1;
        }
      } else {
        // Party > 5: strongly prioritize if at least 4 others haven't completed
        if (otherUncompletedCount >= 4) {
          sharedScore = 3;
        } else if (otherUncompletedCount >= 1) {
          sharedScore = 1;
        }
      }

      // Player count bucket boost
      let bucketBoost = 0;
      if (badge.playerCountBucket === "gte_5" && displayPartySize >= 5) {
        bucketBoost = 1;
      } else if (badge.playerCountBucket === "lte_3" && displayPartySize <= 3) {
        bucketBoost = 1;
      } else if (badge.playerCountBucket === "gte_5" && displayPartySize < 5) {
        bucketBoost = -1;
      }

      // Difficulty sort key (ascending, unknown = last)
      const difficultyMap: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };
      const difficultySortKey = difficultyMap[badge.defaultDifficulty] ?? 99;

      return {
        ...badge,
        otherUncompletedCount,
        sharedScore,
        bucketBoost,
        difficultySortKey,
        sortScore: sharedScore * 100 + otherUncompletedCount * 10 + bucketBoost * 5 - difficultySortKey,
      };
    }).sort((badgeA, badgeB) => badgeB.sortScore - badgeA.sortScore);
  }, [allBadges, currentUserId, otherRealMemberIds, displayPartySize]);

  const filteredRecommendations = useMemo(() => {
    switch (recommendationFilter) {
      case "best":
        return recommendedBadges.filter((badge) => badge.sharedScore >= 3);
      case "broader":
        return recommendedBadges.filter((badge) => badge.sharedScore >= 1);
      case "all":
      default:
        return recommendedBadges;
    }
  }, [recommendedBadges, recommendationFilter]);

  const userSelectedBadgeIds = new Set(
    session.selections
      .filter((selection) => selection.selectedBy.id === currentUserId)
      .map((selection) => selection.badgeId)
  );

  // Group badges tab: split into "yours" and "others"
  const yourSelections = session.selections.filter((selection) => selection.selectedBy.id === currentUserId);
  const othersSelections = session.selections.filter(
    (selection) => selection.selectedBy.id !== currentUserId && !userSelectedBadgeIds.has(selection.badgeId)
  );

  // Separate per-visit from normal
  const yourPerVisit = yourSelections.filter((selection) => selection.isPerVisit);
  const yourNormal = yourSelections.filter((selection) => !selection.isPerVisit);
  const othersPerVisit = othersSelections.filter((selection) => selection.isPerVisit);
  const othersNormal = othersSelections.filter((selection) => !selection.isPerVisit);

  const perVisitRecommended = filteredRecommendations.filter((badge) => badge.isPerVisit);
  const normalRecommended = filteredRecommendations.filter((badge) => !badge.isPerVisit);

  return (
    <div className="space-y-6">
      {/* Session header */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/sessions" className="text-xs text-muted hover:text-foreground">
              &larr; Sessions
            </Link>
            <h1 className="mt-1 text-xl font-bold text-foreground">
              {session.title ?? new Date(session.sessionDateLocal).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric", year: "numeric",
              })}
            </h1>
            <p className="text-xs text-muted">
              Created by {session.createdBy.displayName}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              session.status === "active"
                ? "bg-success/20 text-success"
                : session.status === "completed_pending_ack"
                ? "bg-warning/20 text-warning"
                : "bg-border text-muted"
            }`}>
              {session.status === "active" ? "Active" : session.status === "completed_pending_ack" ? "Review Pending" : "Closed"}
            </span>
          </div>
        </div>

        {/* Party members */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {session.members.map((member) => (
            <span
              key={member.id}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                member.id === currentUserId ? "bg-accent/20 text-accent" : "bg-border text-foreground"
              }`}
            >
              {member.displayName}
              {member.rankColor && (
                <span className="ml-1 text-[10px] text-muted">({member.rankColor})</span>
              )}
            </span>
          ))}
          {session.ghostMembers.map((ghost) => (
            <span key={ghost.id} className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
              {ghost.displayName} (ghost)
            </span>
          ))}
          <span className="text-xs text-muted">
            = {displayPartySize} total
          </span>
        </div>

        {/* Session actions */}
        {session.status === "active" && isMember && (
          <div className="mt-4">
            <button
              onClick={() => completeSession(session.id)}
              className="rounded-lg bg-warning/20 px-4 py-2 text-xs font-medium text-warning hover:bg-warning/30 transition-colors"
            >
              Complete Session
            </button>
          </div>
        )}

        {/* Post-session review prompt */}
        {session.status === "completed_pending_ack" && session.userAck?.needsReview && (
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <p className="text-sm text-warning">
              {session.completedBy?.displayName} has completed this session. Review your badge completions?
            </p>
            <button
              onClick={() => acknowledgeSession(session.id)}
              className="mt-2 rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Mark Reviewed
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-card p-1 border border-border">
        <button
          onClick={() => setActiveTab("your_badges")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "your_badges"
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          Your Badges
        </button>
        <button
          onClick={() => setActiveTab("group_badges")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "group_badges"
              ? "bg-accent text-white"
              : "text-muted hover:text-foreground"
          }`}
        >
          Group Badges ({session.selections.length})
        </button>
      </div>

      {/* Your Badges tab */}
      {activeTab === "your_badges" && (
        <div className="space-y-6">
          {/* Recommendation filter */}
          <div className="flex gap-2">
            {(["best", "broader", "all"] as const).map((filterOption) => (
              <button
                key={filterOption}
                onClick={() => setRecommendationFilter(filterOption)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  recommendationFilter === filterOption
                    ? "bg-accent text-white"
                    : "bg-card border border-border text-muted hover:text-foreground"
                }`}
              >
                {filterOption === "best" && "Best shared candidates"}
                {filterOption === "broader" && "Broader candidates"}
                {filterOption === "all" && "All uncompleted"}
              </button>
            ))}
          </div>

          {/* Per-visit section */}
          {perVisitRecommended.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-accent">Per-Visit Badges</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {perVisitRecommended.map((badge) => (
                  <RecommendedBadgeCard
                    key={badge.id}
                    badge={badge}
                    isSelected={userSelectedBadgeIds.has(badge.id)}
                    sessionId={session.id}
                    memberCount={session.members.length}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Normal badges */}
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Normal Badges ({normalRecommended.length})
            </h3>
            {normalRecommended.length === 0 ? (
              <p className="text-sm text-muted">
                {recommendationFilter === "best"
                  ? "No badges match the best-shared criteria. Try broadening the filter."
                  : "You've completed all badges! Incredible."}
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {normalRecommended.map((badge) => (
                  <RecommendedBadgeCard
                    key={badge.id}
                    badge={badge}
                    isSelected={userSelectedBadgeIds.has(badge.id)}
                    sessionId={session.id}
                    memberCount={session.members.length}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Group Badges tab */}
      {activeTab === "group_badges" && (
        <div className="space-y-6">
          {session.selections.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-muted">No badges selected yet.</p>
              <p className="mt-1 text-sm text-muted">
                Switch to &quot;Your Badges&quot; to select badges for this session.
              </p>
            </div>
          ) : (
            <>
              {/* Per-visit */}
              {(yourPerVisit.length > 0 || othersPerVisit.length > 0) && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-accent">Per-Visit</h3>
                  {yourPerVisit.length > 0 && (
                    <div className="mb-2">
                      <p className="mb-1 text-xs text-muted">Your selections</p>
                      <div className="space-y-1">
                        {yourPerVisit.map((selection) => (
                          <GroupBadgeCard key={selection.id} selection={selection} allSelections={session.selections} members={session.members} currentUserId={currentUserId} />
                        ))}
                      </div>
                    </div>
                  )}
                  {othersPerVisit.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs text-muted">Others&apos; selections</p>
                      <div className="space-y-1">
                        {othersPerVisit.map((selection) => (
                          <GroupBadgeCard key={selection.id} selection={selection} allSelections={session.selections} members={session.members} currentUserId={currentUserId} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Normal */}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">Normal</h3>
                {yourNormal.length > 0 && (
                  <div className="mb-2">
                    <p className="mb-1 text-xs text-muted">Your selections</p>
                    <div className="space-y-1">
                      {yourNormal.map((selection) => (
                        <GroupBadgeCard key={selection.id} selection={selection} allSelections={session.selections} members={session.members} currentUserId={currentUserId} />
                      ))}
                    </div>
                  </div>
                )}
                {othersNormal.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-muted">Others&apos; selections</p>
                    <div className="space-y-1">
                      {othersNormal.map((selection) => (
                        <GroupBadgeCard key={selection.id} selection={selection} allSelections={session.selections} members={session.members} currentUserId={currentUserId} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RecommendedBadgeCard({
  badge,
  isSelected,
  sessionId,
  memberCount,
  currentUserId,
}: {
  badge: BadgeData & { otherUncompletedCount: number; sharedScore: number };
  isSelected: boolean;
  sessionId: string;
  memberCount: number;
  currentUserId: string;
}) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${
      isSelected ? "border-accent/30 bg-accent/5" : "border-border bg-card hover:bg-card-hover"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/badges/${badge.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-muted">#{badge.badgeNumber}</span>
            <span className="truncate text-sm font-medium text-foreground">{badge.name}</span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted">{badge.description}</p>
        </Link>
        <button
          onClick={() => toggleBadgeSelection(sessionId, badge.id)}
          className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
            isSelected
              ? "border-accent/30 bg-accent text-white"
              : "border-border text-muted hover:border-accent hover:text-accent"
          }`}
        >
          {isSelected ? "Selected" : "Select"}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px]">
        <span className="text-success">
          {badge.otherUncompletedCount}/{memberCount - 1} others need this
        </span>
        {badge.isPerVisit && <span className="text-accent">per-visit</span>}
        {badge.playerCountBucket !== "none" && (
          <span className="text-muted">
            {badge.playerCountBucket === "lte_3" ? "≤3p" : "5+p"}
          </span>
        )}
      </div>
    </div>
  );
}

function GroupBadgeCard({
  selection,
  allSelections,
  members,
  currentUserId,
}: {
  selection: Selection;
  allSelections: Selection[];
  members: SessionMember[];
  currentUserId: string;
}) {
  const selectorsForThisBadge = allSelections
    .filter((otherSelection) => otherSelection.badgeId === selection.badgeId)
    .map((otherSelection) => otherSelection.selectedBy);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <Link href={`/badges/${selection.badgeId}`} className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono text-muted">#{selection.badgeNumber}</span>
          <span className="truncate text-sm font-medium text-foreground hover:text-accent">
            {selection.badgeName}
          </span>
        </Link>
        {selection.isPerVisit && (
          <span className="text-[10px] text-accent">per-visit</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {selectorsForThisBadge.map((selector) => (
          <span
            key={selector.id}
            className={`rounded-full px-2 py-0.5 text-[10px] ${
              selector.id === currentUserId ? "bg-accent/20 text-accent" : "bg-border text-muted"
            }`}
          >
            {selector.displayName}
          </span>
        ))}
      </div>
    </div>
  );
}
