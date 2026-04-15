"use client";

import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { CustomSelect } from "@/components/custom-select";
import {
  toggleBadgeCompletion,
  updateBadgeDifficulty,
  updateIdealPlayerCount,
  updatePersonalNotes,
} from "@/app/actions/badges";
import { createBadgeComment, toggleCommentReaction, toggleCommentPin, deleteBadgeComment } from "@/app/actions/comments";
import type { Difficulty, PlayerCountBucket, ReactionType } from "@prisma/client";

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; color: string }[] = [
  { value: "easy", label: "Easy", color: "text-green-400 bg-green-400/10" },
  { value: "medium", label: "Medium", color: "text-yellow-400 bg-yellow-400/10" },
  { value: "hard", label: "Hard", color: "text-orange-400 bg-orange-400/10" },
  { value: "impossible", label: "Impossible?", color: "text-red-400 bg-red-400/10" },
];

const REACTION_TYPES: { value: ReactionType; emoji: string }[] = [
  { value: "thumbs_up", emoji: "\u{1F44D}" },
  { value: "heart", emoji: "\u{2764}\u{FE0F}" },
  { value: "laugh", emoji: "\u{1F602}" },
  { value: "fire", emoji: "\u{1F525}" },
  { value: "question", emoji: "\u{2753}" },
];

interface BadgeInfo {
  id: string;
  badgeNumber: number;
  name: string;
  description: string;
  rooms: string[];
  games: string[];
  isPerVisit: boolean;
  isMetaBadge: boolean;
}

interface UserStatus {
  isCompleted: boolean;
  personalDifficulty: string | null;
  idealPlayerCountBucket: string | null;
  personalNotesSummary: string | null;
}

interface CompletedUser {
  id: string;
  displayName: string;
  personalDifficulty: string | null;
}

interface CommentReaction {
  id: string;
  reactionType: string;
  userId: string;
}

interface Comment {
  id: string;
  body: string;
  isPinned: boolean;
  editedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    image: string | null;
  };
  reactions: CommentReaction[];
}

interface MetaRule {
  id: string;
  ruleType: string;
  rulePayloadJson: Record<string, unknown>;
}

interface Props {
  badge: BadgeInfo;
  currentUserId: string;
  currentUserRole: string;
  currentUserStatus: UserStatus;
  completedByUsers: CompletedUser[];
  communityDifficultyVotes: string[];
  communityPlayerCountVotes: string[];
  comments: Comment[];
  metaRules: MetaRule[];
}

function computeCommunityAverage(votes: string[]): string {
  const numericMap: Record<string, number> = { easy: 1, medium: 2, hard: 3, impossible: 4 };
  const numericVotes: number[] = [];

  for (const vote of votes) {
    if (numericMap[vote] !== undefined) {
      numericVotes.push(numericMap[vote]);
    }
  }

  if (numericVotes.length === 0) return "???";

  const mean = numericVotes.reduce((sum, value) => sum + value, 0) / numericVotes.length;
  const rounded = Math.max(1, Math.min(4, Math.round(mean)));
  const reverseMap: Record<number, string> = { 1: "Easy", 2: "Medium", 3: "Hard", 4: "Impossible?" };
  return reverseMap[rounded];
}

function computeCommunityPlayerCount(votes: string[] | undefined): string {
  const counts: Record<string, number> = {};
  for (const vote of (votes ?? [])) {
    if (vote !== "none") counts[vote] = (counts[vote] ?? 0) + 1;
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return "Any";

  entries.sort((entryA, entryB) => entryB[1] - entryA[1]);
  const winner = entries[0][0];
  if (winner === "lte_3") return "≤3";
  if (winner === "gte_5") return "5+";
  return "Any";
}

export function BadgeDetailClient({
  badge,
  currentUserId,
  currentUserRole,
  currentUserStatus,
  completedByUsers,
  communityDifficultyVotes,
  communityPlayerCountVotes,
  comments,
  metaRules,
}: Props) {
  const [newComment, setNewComment] = useState("");
  const [notesValue, setNotesValue] = useState(currentUserStatus.personalNotesSummary ?? "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  const communityAverageLabel = computeCommunityAverage(communityDifficultyVotes);
  const communityPlayerCountLabel = computeCommunityPlayerCount(communityPlayerCountVotes);
  const playerCountVoteCount = (communityPlayerCountVotes ?? []).filter((vote) => vote !== "none").length;

  async function handleSaveNotes() {
    setIsSavingNotes(true);
    await updatePersonalNotes(badge.id, notesValue || null);
    setIsSavingNotes(false);
    setIsEditingNotes(false);
  }

  async function handleSubmitComment() {
    if (!newComment.trim()) return;
    await createBadgeComment(badge.id, newComment);
    setNewComment("");
  }

  return (
    <div className="space-y-6">
      <BackButton fallback="/badges" label="Badges" />

      {/* Badge header — no badge number */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{badge.name}</h1>
            <p className="mt-3 text-sm text-muted leading-relaxed">{badge.description}</p>
          </div>

          <button
            onClick={() => toggleBadgeCompletion(badge.id)}
            className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
              currentUserStatus.isCompleted
                ? "border-success/30 bg-success/10 text-success hover:bg-success/20"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
          >
            {currentUserStatus.isCompleted ? "Completed" : "Mark Complete"}
          </button>
        </div>

        {/* Badge metadata pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {badge.isPerVisit && (
            <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent">Visit-specific</span>
          )}
          {badge.isMetaBadge && (
            <span className="rounded-full bg-purple-500/20 px-3 py-1 text-xs font-medium text-purple-400">Meta badge</span>
          )}
          {badge.rooms.map((room) => (
            <span key={room} className="rounded-full bg-border px-3 py-1 text-xs text-muted">{room}</span>
          ))}
          {badge.games.map((game) => (
            <span key={game} className="rounded-full bg-border px-3 py-1 text-xs text-muted">{game}</span>
          ))}
        </div>

        {/* Meta rules — hidden from UI for now */}
      </div>

      {/* Difficulty + player count — one line each */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted w-20 shrink-0">Difficulty</span>
          <span className="text-sm text-foreground">{communityAverageLabel}</span>
          <span className="text-[10px] text-muted">({communityDifficultyVotes.length} vote{communityDifficultyVotes.length !== 1 ? "s" : ""})</span>
          <span className="text-[10px] text-muted">·</span>
          <span className="text-[10px] text-muted">Your rating:</span>
          <CustomSelect
            value={currentUserStatus.personalDifficulty ?? ""}
            onChange={(newValue) => {
              if (newValue) updateBadgeDifficulty(badge.id, newValue as Difficulty);
            }}
            options={[
              { value: "", label: "Not rated" },
              ...DIFFICULTY_OPTIONS.map((difficultyOption) => ({ value: difficultyOption.value, label: difficultyOption.label })),
            ]}
            compact
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted w-20 shrink-0"># Players</span>
          <span className="text-sm text-foreground">{communityPlayerCountLabel}</span>
          <span className="text-[10px] text-muted">({playerCountVoteCount} vote{playerCountVoteCount !== 1 ? "s" : ""})</span>
          <span className="text-[10px] text-muted">·</span>
          <span className="text-[10px] text-muted">Your pick:</span>
          <CustomSelect
            value={currentUserStatus.idealPlayerCountBucket ?? ""}
            onChange={(newValue) => {
              const selectedBucket = newValue as PlayerCountBucket | "";
              updateIdealPlayerCount(badge.id, selectedBucket || null);
            }}
            options={[
              { value: "", label: "No preference" },
              { value: "lte_3", label: "3 or fewer" },
              { value: "gte_5", label: "5 or more" },
            ]}
            compact
          />
        </div>
      </div>

      {/* Completed by */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Completed by ({completedByUsers.length})
        </h2>
        {completedByUsers.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No one has completed this badge yet.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {completedByUsers.map((completedUser) => (
              <div key={completedUser.id} className="flex items-center justify-between">
                <Link
                  href={`/players/${completedUser.id}`}
                  className={`text-sm hover:underline transition-colors ${completedUser.id === currentUserId ? "text-success font-medium" : "text-foreground hover:text-accent"}`}
                >
                  {completedUser.displayName}
                </Link>
                {completedUser.personalDifficulty && completedUser.personalDifficulty !== "unknown" && (
                  <span className="text-xs text-muted">Rated: {completedUser.personalDifficulty}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Personal notes — edit/save toggle */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Your Notes</h2>
          {!isEditingNotes ? (
            <button
              onClick={() => setIsEditingNotes(true)}
              className="rounded-lg border border-border px-3 py-1 text-xs text-muted hover:text-foreground transition-colors"
            >
              Edit Notes
            </button>
          ) : (
            <button
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {isSavingNotes ? "Saving..." : "Save"}
            </button>
          )}
        </div>
        {isEditingNotes ? (
          <textarea
            value={notesValue}
            onChange={(event) => setNotesValue(event.target.value)}
            placeholder="Add personal notes about this badge..."
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            rows={3}
            autoFocus
          />
        ) : (
          <p className="mt-2 text-sm text-muted whitespace-pre-wrap">
            {notesValue || "No notes yet."}
          </p>
        )}
      </div>

      {/* Comments */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Comments ({comments.length})
        </h2>

        <div className="mt-3">
          <textarea
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            placeholder="Leave a comment..."
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            rows={2}
          />
          <button
            onClick={handleSubmitComment}
            disabled={!newComment.trim()}
            className="mt-2 rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            Post Comment
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className={`rounded-lg border p-3 ${
                comment.isPinned ? "border-accent/30 bg-accent/5" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {comment.author.image ? (
                    <img src={comment.author.image} alt="" className="h-5 w-5 rounded-full" />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] text-white">
                      {comment.author.displayName.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-medium text-foreground">{comment.author.displayName}</span>
                  {comment.isPinned && <span className="text-[10px] text-accent">pinned</span>}
                  {comment.editedAt && <span className="text-[10px] text-muted">(edited)</span>}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted">{new Date(comment.createdAt).toLocaleDateString()}</span>
                  {currentUserRole === "superuser" && (
                    <button onClick={() => toggleCommentPin(comment.id)} className="text-[10px] text-muted hover:text-accent">
                      {comment.isPinned ? "unpin" : "pin"}
                    </button>
                  )}
                  {(comment.author.id === currentUserId || currentUserRole === "superuser") && (
                    <button onClick={() => deleteBadgeComment(comment.id)} className="text-[10px] text-muted hover:text-danger">
                      delete
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-sm text-foreground">{comment.body}</p>

              {/* Reactions — one per user */}
              <div className="mt-2 flex flex-wrap gap-1">
                {REACTION_TYPES.map((reactionOption) => {
                  const reactionCount = comment.reactions.filter(
                    (reaction) => reaction.reactionType === reactionOption.value
                  ).length;
                  const userReacted = comment.reactions.some(
                    (reaction) => reaction.reactionType === reactionOption.value && reaction.userId === currentUserId
                  );
                  return (
                    <button
                      key={reactionOption.value}
                      onClick={() => toggleCommentReaction(comment.id, reactionOption.value)}
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                        userReacted
                          ? "border-accent/30 bg-accent/10"
                          : "border-border hover:border-muted"
                      }`}
                    >
                      <span>{reactionOption.emoji}</span>
                      {reactionCount > 0 && <span className="text-muted">{reactionCount}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
