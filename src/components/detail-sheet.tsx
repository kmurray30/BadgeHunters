"use client";

import { useEffect } from "react";
import { PlayerSliceIcon } from "@/components/completion-pie";
import type { RosterPlayer } from "@/lib/roster";

interface DetailSheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Bottom sheet on phones, centered dialog on wider screens. */
export function DetailSheet({ title, subtitle, onClose, children }: DetailSheetProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="animate-fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="panel animate-sheet-up w-full max-w-md rounded-b-none p-5 shadow-2xl shadow-black md:rounded-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-bold uppercase leading-tight">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-muted transition hover:bg-card-hover hover:text-foreground"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export interface PlayerStatusRow {
  player: RosterPlayer;
  done: boolean;
  /** Extra text on the right, e.g. a score */
  detail?: string;
}

/** Who has / hasn't done something, one row per selected player. */
export function PlayerStatusList({ rows }: { rows: PlayerStatusRow[] }) {
  return (
    <ul className="space-y-1.5">
      {rows.map(({ player, done, detail }, index) => (
        <li key={player.id} className="flex items-center gap-3 rounded-xl bg-background/60 px-3 py-2.5">
          <PlayerSliceIcon index={index} count={rows.length} color={player.color} size={18} />
          <span className="min-w-0 flex-1 truncate font-semibold">
            {player.name}
            {player.isMe && <span className="ml-1.5 text-xs font-medium text-muted">you</span>}
          </span>
          {detail && <span className="font-display text-sm tabular-nums text-muted">{detail}</span>}
          <span className={`text-sm font-bold ${done ? "text-success" : "text-muted"}`}>{done ? "Done" : "Not yet"}</span>
        </li>
      ))}
    </ul>
  );
}
