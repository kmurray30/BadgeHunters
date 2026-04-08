"use client";

import { useRef, useState } from "react";
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
  defaultDate: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Produces a friendly label like "Today", "Tomorrow", "Wednesday", etc.
 * Uses pure string math on YYYY-MM-DD strings to avoid any Date() timezone issues.
 */
function getFriendlyDateLabel(dateString: string, todayString: string): string {
  // Parse both as [year, month, day] integers — no Date objects, no timezone drift
  const [selY, selM, selD] = dateString.split("-").map(Number);
  const [todY, todM, todD] = todayString.split("-").map(Number);

  // Convert to day-count from a fixed epoch for diffing (good enough for ±year range)
  function toDayCount(year: number, month: number, day: number): number {
    // Simplified — accurate for diffs within a few years
    return year * 365 + Math.floor(year / 4) + [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1] + day;
  }

  const diffDays = toDayCount(selY, selM, selD) - toDayCount(todY, todM, todD);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";

  if (diffDays > 1 && diffDays <= 6) {
    // Get the day name using a known reference: Date with noon UTC to avoid timezone shift
    const dayIndex = new Date(Date.UTC(selY, selM - 1, selD, 12)).getUTCDay();
    return DAY_NAMES[dayIndex];
  }

  // Fallback: short formatted date (also timezone-safe via UTC)
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[selM - 1]} ${selD}, ${selY}`;
}

export function NewSessionClient({ availableUsers, currentUserDisplayName, defaultDate }: Props) {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [ghostNames, setGhostNames] = useState<string[]>([]);
  const [ghostInput, setGhostInput] = useState("");
  const [sessionDate, setSessionDate] = useState(defaultDate);
  const [isCreating, setIsCreating] = useState(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
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
      const sessionId = await createSession(selectedMembers, ghostNames, sessionDate);
      // Replace instead of push so the creation form is removed from history —
      // pressing Back from the new session goes to sessions list, not back here.
      router.replace(`/sessions/${sessionId}`);
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

      {/* Session date — friendly label + native calendar picker */}
      <div className="flex items-center gap-2">
        <div className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground">
          {getFriendlyDateLabel(sessionDate, defaultDate)}
        </div>
        <label className="rounded-lg border border-border bg-card p-2.5 text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <input
            ref={dateInputRef}
            type="date"
            value={sessionDate}
            min={defaultDate}
            onChange={(event) => { if (event.target.value) setSessionDate(event.target.value); }}
            style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clipPath: "inset(50%)", border: 0 }}
            tabIndex={-1}
          />
        </label>
        <span className="text-xs text-muted">Set session date</span>
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
