"use client";

import { useMemo, useState, useTransition } from "react";
import { addPlayer, getPlayerSuggestions } from "@/app/actions/players";
import { DetailSheet } from "@/components/detail-sheet";
import { useSyncRun } from "@/hooks/use-sync-run";

const MAX_SUGGESTIONS = 8;

/**
 * "Add player" button and sheet. Suggestions are our location's top players
 * for the year (fetched when the sheet first opens); any other exact
 * PlayActivate username can be typed in. Adding
 * someone kicks off a sync so their scores and badges show up right away.
 */
export function AddPlayer() {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [addedName, setAddedName] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const sync = useSyncRun();

  const trimmed = query.trim();
  const matches = useMemo(() => {
    const needle = trimmed.toLowerCase();
    if (!suggestions) return [];
    if (!needle) return suggestions.slice(0, MAX_SUGGESTIONS);
    return suggestions
      .filter((name) => name.toLowerCase().includes(needle))
      .sort((nameA, nameB) => Number(!nameA.toLowerCase().startsWith(needle)) - Number(!nameB.toLowerCase().startsWith(needle)))
      .slice(0, MAX_SUGGESTIONS);
  }, [suggestions, trimmed]);
  const exactMatch = matches.some((name) => name.toLowerCase() === trimmed.toLowerCase());

  function add(name: string) {
    setError(null);
    startAdding(async () => {
      const result = await addPlayer(name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAddedName(result.name);
      setQuery("");
      setOpen(false);
      void sync.start();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          // Loaded on first open so the Players page doesn't wait on PlayActivate.
          if (!suggestions) getPlayerSuggestions().then(setSuggestions, () => setSuggestions([]));
        }}
        className="btn-glow rounded-xl border border-accent/60 px-3 py-2 text-xs font-bold uppercase tracking-wide text-accent transition hover:bg-accent/10"
      >
        + Add player
      </button>

      {addedName && (
        <p className="basis-full text-xs text-muted">
          Added <span className="font-semibold text-foreground">{addedName}</span>.{" "}
          {sync.state.phase === "running" && `Syncing their scores… ${sync.state.label}`}
          {sync.state.phase === "done" && "Their scores and badges are in."}
          {sync.state.phase === "error" && <span className="text-danger">Sync failed: {sync.state.message}. The hourly sync will pick them up.</span>}
        </p>
      )}

      {open && (
        <DetailSheet
          title="Add a player"
          subtitle="Anyone with PlayActivate scores at our location. They join the picker and the hourly sync; if they sign up later with the same username, it becomes their account."
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (trimmed.length >= 2 && !adding) add(exactMatch ? matches.find((name) => name.toLowerCase() === trimmed.toLowerCase())! : trimmed);
            }}
          >
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="PlayActivate username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-accent"
            />
          </form>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}

          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {matches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => add(name)}
                  className="flex w-full items-center justify-between rounded-xl bg-background/60 px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-card-hover disabled:opacity-50"
                >
                  {name}
                  <span className="text-xs font-bold uppercase text-accent">Add</span>
                </button>
              </li>
            ))}
            {trimmed.length >= 2 && !exactMatch && (
              <li>
                <button
                  type="button"
                  disabled={adding}
                  onClick={() => add(trimmed)}
                  className="w-full rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-sm transition hover:border-accent disabled:opacity-50"
                >
                  Add “<span className="font-semibold">{trimmed}</span>”
                  <span className="block text-xs text-muted">Not in this year’s top 100; we’ll check PlayActivate for the exact username.</span>
                </button>
              </li>
            )}
          </ul>
          {!suggestions && <p className="mt-3 text-sm text-muted">Loading this year’s top players…</p>}
          {adding && <p className="mt-3 text-sm text-muted">Checking PlayActivate…</p>}
        </DetailSheet>
      )}
    </>
  );
}
