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
          <div className="space-y-2">
            {visibleActive.map((session) => (
              <Link
                key={session.id}
                href={`/sessions/${session.id}`}
                className="block rounded-xl border bg-card px-4 py-2.5 hover:bg-card-hover transition-colors"
                style={{ borderColor: session.isMember ? "rgba(34,197,94,0.4)" : "rgba(99,102,241,0.3)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-medium text-foreground">
                    {session.title ?? session.dateDisplay}
                    <span className="text-xs font-normal text-muted"> &mdash; {session.createdByDisplayName}</span>
                  </p>
                  {session.needsReview ? (
                    <span className="shrink-0 rounded-full bg-warning/20 px-3 py-0.5 text-xs font-medium text-warning">Pending Review</span>
                  ) : session.dateStringLA > todayString ? (
                    <span className="shrink-0 rounded-full bg-blue-500/20 px-3 py-0.5 text-xs font-medium text-blue-400">Future</span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-success/20 px-3 py-0.5 text-xs font-medium text-success">Active</span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
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
                    <span className="ml-1 text-[10px] text-muted">{session.selectionCount} badges</span>
                  </div>
                  {session.isMember ? (
                    <span className="shrink-0 text-[11px] font-medium text-success">You are in this session</span>
                  ) : (
                    <span />
                  )}
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
                className="block rounded-xl border bg-card px-4 py-2.5 hover:bg-card-hover transition-colors"
                style={{ borderColor: session.isMember ? "rgba(34,197,94,0.4)" : "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-foreground">
                    {session.title ?? session.dateDisplay}
                    <span className="text-xs font-normal text-muted"> &mdash; {session.createdByDisplayName}</span>
                  </p>
                  <span className="shrink-0 rounded-full bg-border px-3 py-0.5 text-xs font-medium text-muted">
                    Closed
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
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
                    <span className="ml-1 text-[10px] text-muted">{session.selectionCount} badges</span>
                  </div>
                  {session.isMember ? (
                    <span className={`shrink-0 text-[11px] font-medium ${session.needsReview ? "text-success" : "text-blue-400"}`}>You were in this session</span>
                  ) : (
                    <span />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
