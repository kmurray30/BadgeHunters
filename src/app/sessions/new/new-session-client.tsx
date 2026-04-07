"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSession } from "@/app/actions/sessions";
import Link from "next/link";

interface AvailableUser {
  id: string;
  displayName: string;
}

export function NewSessionClient({ availableUsers }: { availableUsers: AvailableUser[] }) {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [ghostNames, setGhostNames] = useState<string[]>([""]);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  function toggleMember(userId: string) {
    setSelectedMembers((previous) =>
      previous.includes(userId)
        ? previous.filter((memberId) => memberId !== userId)
        : [...previous, userId]
    );
  }

  function addGhostSlot() {
    setGhostNames((previous) => [...previous, ""]);
  }

  function updateGhostName(index: number, name: string) {
    setGhostNames((previous) => {
      const updated = [...previous];
      updated[index] = name;
      return updated;
    });
  }

  function removeGhostSlot(index: number) {
    setGhostNames((previous) => previous.filter((_, ghostIndex) => ghostIndex !== index));
  }

  async function handleCreate() {
    setIsCreating(true);
    try {
      const sessionId = await createSession(
        selectedMembers,
        ghostNames.filter((name) => name.trim())
      );
      router.push(`/sessions/${sessionId}`);
    } catch {
      setIsCreating(false);
    }
  }

  const totalPartySize = 1 + selectedMembers.length + ghostNames.filter((name) => name.trim()).length;

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
        <p className="mt-1 text-xs text-muted">You are automatically included. Select who else is coming.</p>

        <div className="mt-3 space-y-2">
          {availableUsers.map((appUser) => (
            <button
              key={appUser.id}
              onClick={() => toggleMember(appUser.id)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                selectedMembers.includes(appUser.id)
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border text-foreground hover:bg-card-hover"
              }`}
            >
              <span>{appUser.displayName}</span>
              {selectedMembers.includes(appUser.id) && (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
          {availableUsers.length === 0 && (
            <p className="text-xs text-muted">No other users available. Create test users in admin mode, or have friends sign up!</p>
          )}
        </div>
      </div>

      {/* Ghost members */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Ghost Players</h2>
        <p className="mt-1 text-xs text-muted">
          People who are physically there but don&apos;t have accounts. They count toward party size only.
        </p>

        <div className="mt-3 space-y-2">
          {ghostNames.map((ghostName, ghostIndex) => (
            <div key={ghostIndex} className="flex gap-2">
              <input
                type="text"
                value={ghostName}
                onChange={(event) => updateGhostName(ghostIndex, event.target.value)}
                placeholder={`Ghost player ${ghostIndex + 1}...`}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => removeGhostSlot(ghostIndex)}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-danger transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            onClick={addGhostSlot}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            + Add ghost player
          </button>
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
              {1 + selectedMembers.length} real + {ghostNames.filter((name) => name.trim()).length} ghosts
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
