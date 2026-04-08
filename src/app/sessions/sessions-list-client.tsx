"use client";

import Link from "next/link";
import { useState } from "react";

interface SessionMember {
  id: string;
  displayName: string;
  isCurrentUser: boolean;
}

interface GhostMember {
  id: string;
  displayName: string;
}

interface SessionListItem {
  id: string;
  title: string | null;
  dateDisplay: string;
  dateStringLA: string;
  status: string;
  createdByDisplayName: string;
  members: SessionMember[];
  ghostMembers: GhostMember[];
  selectionCount: number;
  needsReview: boolean;
  isMember: boolean;
}

interface Props {
  activeSessions: SessionListItem[];
  pastSessions: SessionListItem[];
  todayString: string;
}

export function SessionsListClient({ activeSessions, pastSessions, todayString }: Props) {
  const [onlyMine, setOnlyMine] = useState(false);

  const visibleActive = onlyMine
    ? activeSessions.filter((session) => session.isMember)
    : activeSessions;

  const visiblePast = onlyMine
    ? pastSessions.filter((session) => session.isMember)
    : pastSessions;

  return (
    <div className="space-y-8">
      {/* "My sessions" toggle — sits below the page header */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOnlyMine((previous) => !previous)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors ${
            onlyMine
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${onlyMine ? "bg-accent" : "bg-muted"}`}
          />
          My sessions only
        </button>
      </div>

      {/* Active sessions */}
      {visibleActive.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">Active Sessions</h2>
          <div className="space-y-3">
            {visibleActive.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block rounded-xl border border-accent/30 bg-card p-4 hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{session.title ?? session.dateDisplay}</p>
                    <p className="mt-1 text-xs text-muted">Created by {session.createdByDisplayName}</p>
                    {session.isMember && (
                      <p className="mt-0.5 text-[11px] font-medium text-success">You are in this session</p>
                    )}
                  </div>
                  <div className="text-right">
                    {session.dateStringLA > todayString ? (
                      <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-400">
                        Future
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/20 px-3 py-1 text-xs font-medium text-success">
                        Active
                      </span>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {session.members.length} hunters + {session.ghostMembers.length} others
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {session.members.map((member) => (
                    <span
                      key={member.id}
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        member.isCurrentUser ? "bg-accent/20 text-accent" : "bg-border text-muted"
                      }`}
                    >
                      {member.displayName}
                    </span>
                  ))}
                  {session.ghostMembers.map((ghost) => (
                    <span key={ghost.id} className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
                      {ghost.displayName}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Past sessions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Session History</h2>
        {pastSessions.length === 0 && activeSessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-muted">No sessions yet.</p>
            <p className="mt-1 text-sm text-muted">Create one to start planning your badge runs!</p>
          </div>
        ) : visiblePast.length === 0 ? (
          <p className="text-sm text-muted">
            {onlyMine ? "No past sessions you were in." : "No past sessions yet."}
          </p>
        ) : (
          <div className="space-y-2">
            {visiblePast.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block rounded-xl border border-border bg-card p-4 hover:bg-card-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{session.title ?? session.dateDisplay}</p>
                    <p className="text-xs text-muted">
                      {session.members.length} players &middot; {session.selectionCount} badges selected
                    </p>
                    {session.isMember && (
                      <p className="mt-0.5 text-[11px] font-medium text-success">You were in this session</p>
                    )}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                    session.needsReview ? "bg-warning/20 text-warning" : "bg-border text-muted"
                  }`}>
                    {session.needsReview ? "Pending Review" : "Closed"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
