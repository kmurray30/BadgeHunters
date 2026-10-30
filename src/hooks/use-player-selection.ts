"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { RosterPlayer } from "@/lib/roster";

const STORAGE_KEY = "bh:selected-players";
const CHANGE_EVENT = "bh:selected-players-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private browsing: selection just won't be remembered.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Which players the Badges and Levels pages compare. Shared by both pages and
 * remembered on this device; defaults to just the current user. Can be
 * empty (tap the last selected chip to clear it). In roster order.
 */
export function usePlayerSelection(roster: RosterPlayer[], currentUserId: string) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");

  const selectedIds = useMemo(() => {
    let stored: unknown = null;
    try {
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    const wanted = new Set(Array.isArray(stored) ? stored : [currentUserId]);
    return roster.filter((player) => wanted.has(player.id)).map((player) => player.id);
  }, [raw, roster, currentUserId]);

  const selectedPlayers = useMemo(
    () => roster.filter((player) => selectedIds.includes(player.id)),
    [roster, selectedIds],
  );

  const toggle = useCallback(
    (playerId: string) => {
      if (selectedIds.includes(playerId)) {
        writeIds(selectedIds.filter((id) => id !== playerId));
      } else {
        writeIds([...selectedIds, playerId]);
      }
    },
    [selectedIds],
  );

  const justMe = useCallback(() => writeIds([currentUserId]), [currentUserId]);
  const selectAll = useCallback(() => writeIds(roster.map((player) => player.id)), [roster]);

  return { selectedIds, selectedPlayers, toggle, justMe, selectAll };
}
