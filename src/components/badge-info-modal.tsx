"use client";

import { useEffect, useState, useCallback } from "react";
import { BadgeDetailClient } from "@/app/(app)/badges/[id]/badge-detail-client";

// Kept for callers that still import the type (will become unused once all callers migrate).
/** @deprecated — pass badgeId directly instead; the modal fetches its own data now. */
export interface BadgeInfoModalData {
  id: string;
  badgeNumber: number;
  name: string;
  description: string;
  isPerVisit: boolean;
  isMetaBadge: boolean;
  rooms: string[];
  games: string[];
  difficultyLabel: string;
  difficultyColor: string;
  playerCountLabel: string;
  completedByUsers?: { id: string; displayName: string }[];
  completedByNote?: string;
}

interface BadgeInfoModalProps {
  /** Badge ID to show — or null / the older `badge` prop for backward-compat. */
  badgeId?: string | null;
  /** @deprecated Use badgeId instead. */
  badge?: BadgeInfoModalData;
  onClose: () => void;
}

type DetailData = {
  badge: {
    id: string;
    badgeNumber: number;
    name: string;
    description: string;
    rooms: string[];
    games: string[];
    isPerVisit: boolean;
    isMetaBadge: boolean;
  };
  currentUserId: string;
  currentUserRole: string;
  currentUserStatus: {
    isCompleted: boolean;
    personalDifficulty: string | null;
    idealPlayerCountBucket: string | null;
    personalNotesSummary: string | null;
  };
  completedByUsers: { id: string; displayName: string; personalDifficulty: string | null }[];
  communityDifficultyVotes: string[];
  communityPlayerCountVotes: string[];
  comments: {
    id: string;
    body: string;
    isPinned: boolean;
    editedAt: string | null;
    createdAt: string;
    author: { id: string; displayName: string; image: string | null };
    reactions: { id: string; reactionType: string; userId: string }[];
  }[];
  metaRules: { id: string; ruleType: string; rulePayloadJson: Record<string, unknown> }[];
};

export function BadgeInfoModal({ badgeId, badge: legacyBadge, onClose }: BadgeInfoModalProps) {
  const resolvedId = badgeId ?? legacyBadge?.id ?? null;

  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch(`/api/badges/${id}/detail`);
      if (!response.ok) throw new Error("Failed to load badge details");
      const json = await response.json() as DetailData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (resolvedId) fetchDetail(resolvedId);
  }, [resolvedId, fetchDetail]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-2 py-4 sm:px-4 sm:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex w-full max-w-3xl max-h-[94vh] flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Sticky close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-card text-muted hover:text-foreground hover:bg-card-hover border border-border transition-colors shadow-sm"
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Scrollable content area — mirrors the full page layout */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-24">
              <svg className="h-8 w-8 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <p className="text-sm text-danger">{error}</p>
              {resolvedId && (
                <button
                  type="button"
                  onClick={() => fetchDetail(resolvedId)}
                  className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {data && !loading && (
            <div className="px-4 py-6">
              <BadgeDetailClient
                badge={data.badge}
                currentUserId={data.currentUserId}
                currentUserRole={data.currentUserRole}
                currentUserStatus={data.currentUserStatus}
                completedByUsers={data.completedByUsers}
                communityDifficultyVotes={data.communityDifficultyVotes}
                communityPlayerCountVotes={data.communityPlayerCountVotes}
                comments={data.comments}
                metaRules={data.metaRules}
                isModal
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
