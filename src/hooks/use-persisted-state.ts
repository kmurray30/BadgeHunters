"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Behaves exactly like useState, but reads the initial value from localStorage
 * on first client mount and writes back on every subsequent change.
 *
 * SSR-safe: the server (and the initial client render) always use `defaultValue`
 * to avoid hydration mismatches. The stored value is applied in a useEffect,
 * so there may be a single silent re-render on mount.
 *
 * A single effect handles both the initial load (first run, per key) and all
 * subsequent persists. This avoids the race condition where the second of two
 * separate effects could write the stale default value before the first effect's
 * setState triggers a re-render.
 */
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);
  const phase = useRef<{ key: string; ready: boolean }>({ key: "", ready: false });

  useEffect(() => {
    if (!phase.current.ready || phase.current.key !== storageKey) {
      // First run (or key changed): load from localStorage, don't persist yet.
      phase.current = { key: storageKey, ready: true };
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored !== null) {
          setState(JSON.parse(stored) as T);
        }
      } catch {
        // Corrupted JSON or storage unavailable — use default.
      }
      return;
    }

    // Subsequent runs: persist the current state.
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Private browsing / quota exceeded — silently ignore.
    }
  }, [storageKey, state]);

  return [state, setState];
}
