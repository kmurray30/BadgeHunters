"use client";

import { createFeedbackPost, toggleFeedbackReaction, updateFeedbackStatus } from "@/app/actions/feedback";
import type { FeedbackStatus, ReactionType } from "@prisma/client";
import { useState } from "react";

const REACTION_TYPES: { value: ReactionType; emoji: string }[] = [
  { value: "thumbs_up", emoji: "\u{1F44D}" },
  { value: "heart", emoji: "\u{2764}\u{FE0F}" },
  { value: "laugh", emoji: "\u{1F602}" },
  { value: "fire", emoji: "\u{1F525}" },
  { value: "question", emoji: "\u{2753}" },
];

interface PostReaction {
  id: string;
  reactionType: string;
  userId: string;
}

interface FeedbackPostData {
  id: string;
  body: string;
  status: string;
  editedAt: string | null;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    image: string | null;
  };
  reactions: PostReaction[];
}

interface Props {
  posts: FeedbackPostData[];
  currentUserId: string;
  isSuperuser: boolean;
}

export function FeedbackClient({ posts, currentUserId, isSuperuser }: Props) {
  const [newFeedback, setNewFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    if (!newFeedback.trim()) return;
    setIsSubmitting(true);
    try {
      await createFeedbackPost(newFeedback);
      setNewFeedback("");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Feedback</h1>
        <p className="text-sm text-muted">
          {isSuperuser
            ? "View all feedback from the group."
            : "Share your thoughts, bugs, or feature ideas."}
        </p>
      </div>

      {/* Submit feedback */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Submit Feedback</h2>
        <textarea
          value={newFeedback}
          onChange={(event) => setNewFeedback(event.target.value)}
          placeholder="Bug report, feature request, general thoughts..."
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
          rows={3}
        />
        <button
          onClick={handleSubmit}
          disabled={!newFeedback.trim() || isSubmitting}
          className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
      </div>

      {/* Feedback list */}
      {posts.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-muted">No feedback yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {post.author.image ? (
                    <img src={post.author.image} alt="" className="h-5 w-5 rounded-full" />
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] text-white">
                      {post.author.displayName.charAt(0)}
                    </div>
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {post.author.displayName}
                  </span>
                  <span className="text-[10px] text-muted">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </span>
                  {post.editedAt && <span className="text-[10px] text-muted">(edited)</span>}
                </div>

                {isSuperuser && (
                  <select
                    value={post.status}
                    onChange={(event) => updateFeedbackStatus(post.id, event.target.value as FeedbackStatus)}
                    className="rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted focus:border-accent focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="addressed">Addressed</option>
                    <option value="archived">Archived</option>
                  </select>
                )}
              </div>

              <p className="mt-2 text-sm text-foreground">{post.body}</p>

              {/* Reactions */}
              <div className="mt-2 flex flex-wrap gap-1">
                {REACTION_TYPES.map((reactionOption) => {
                  const reactionCount = post.reactions.filter(
                    (reaction) => reaction.reactionType === reactionOption.value
                  ).length;
                  const userReacted = post.reactions.some(
                    (reaction) => reaction.reactionType === reactionOption.value && reaction.userId === currentUserId
                  );
                  return (
                    <button
                      key={reactionOption.value}
                      onClick={() => toggleFeedbackReaction(post.id, reactionOption.value)}
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
      )}
    </div>
  );
}
