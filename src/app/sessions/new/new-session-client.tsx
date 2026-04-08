"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/app/actions/sessions";
import Link from "next/link";

interface AvailableUser {
  id: string;
  displayName: string;
}

interface Props {
  availableUsers: AvailableUser[];
  currentUserDisplayName: string;
}

export function NewSessionClient({ availableUsers, currentUserDisplayName }: Props) {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [ghostNames, setGhostNames] = useState<string[]>([]);
  const [ghostInput, setGhostInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  function toggleMember(userId: string) {
    setSelectedMembers((previous) =>
      previous.includes(userId)
        ? previous.filter((memberId) => memberId !== userId)
        : [...previous, userId]
    );
  }

  function addGhostPlayer() {
    const trimmed = ghostInput.trim();
    if (!trimmed) return;
    setGhostNames((previous) => [...previous, trimmed]);
    setGhostInput("");
  }

  function removeGhostPlayer(index: number) {
    setGhostNames((previous) => previous.filter((_, ghostIndex) => ghostIndex !== index));
  }

  async function handleCreate() {
    setIsCreating(true);
    try {
      const sessionId = await createSession(selectedMembers, ghostNames);
      router.push(`/sessions/${sessionId}`);
    } catch {
      setIsCreating(false);
    }
  }

  const totalPartySize = 1 + selectedMembers.length + ghostNames.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">New Session</h1>
        <Link href="/sessions" className="text-sm text-muted hover:text-foreground">
          Cancel
        </Link>
      </div>

      {/* Member selection */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Party Members</h2>

        {/* Selected party — boxed together */}
        {(selectedMembers.length > 0 || ghostNames.length > 0) && (
          <div className="mt-3 rounded-lg border border-accent/20 bg-accent/[0.03] p-2 space-y-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-accent/60">Going</p>

            {/* Current user — always included */}
            <div className="flex w-full items-center justify-between rounded-lg bg-accent/5 px-3 py-2 text-sm opacity-50 cursor-default">
              <span className="text-accent">{currentUserDisplayName}</span>
              <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {availableUsers.filter((appUser) => selectedMembers.includes(appUser.id)).map((appUser) => (
              <button
                key={appUser.id}
                onClick={() => toggleMember(appUser.id)}
                className="flex w-full items-center justify-between rounded-lg border border-accent/30 bg-accent/10 text-accent px-3 py-2 text-sm transition-colors"
              >
                <span>{appUser.displayName}</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            ))}

            {ghostNames.map((ghostName, ghostIndex) => (
              <div key={`ghost-${ghostIndex}`} className="flex w-full items-center justify-between rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm">
                <span className="text-warning">
                  {ghostName} <span className="text-[10px] text-warning/60">(non badge-hunter)</span>
                </span>
                <button
                  onClick={() => removeGhostPlayer(ghostIndex)}
                  className="text-xs text-muted hover:text-danger transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Current user shown here when nobody else is selected yet */}
        {selectedMembers.length === 0 && ghostNames.length === 0 && (
          <div className="mt-3 flex w-full items-center justify-between rounded-lg bg-accent/5 px-3 py-2 text-sm opacity-50 cursor-default">
            <span className="text-accent">{currentUserDisplayName}</span>
            <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {/* Unselected users */}
        <div className="mt-4 space-y-2">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Select players</p>
          {availableUsers.filter((appUser) => !selectedMembers.includes(appUser.id)).map((appUser) => (
            <button
              key={appUser.id}
              onClick={() => toggleMember(appUser.id)}
              className="flex w-full items-center justify-between rounded-lg border border-border text-foreground hover:bg-card-hover px-3 py-2 text-sm transition-colors"
            >
              <span>{appUser.displayName}</span>
            </button>
          ))}
          {availableUsers.filter((appUser) => !selectedMembers.includes(appUser.id)).length === 0 && (
            <p className="text-xs text-muted">All players selected!</p>
          )}
        </div>

        {/* Add other players (non badge hunters) */}
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-muted mb-2">Add non badge-hunter players</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={ghostInput}
              onChange={(event) => setGhostInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addGhostPlayer()}
              placeholder="Player name..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              onClick={addGhostPlayer}
              disabled={!ghostInput.trim()}
              className="rounded-lg bg-warning/20 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/30 transition-colors disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Summary and create */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Total party size: {totalPartySize}
            </p>
            <p className="text-xs text-muted">
              {1 + selectedMembers.length} badge hunters + {ghostNames.length} other players
            </p>
          </div>
          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {isCreating ? "Creating..." : "Create Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
