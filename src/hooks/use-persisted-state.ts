"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Behaves exactly like useState, but reads the initial value from localStorage
 * on first client mount and writes back on every change.
 *
 * SSR-safe: the server (and the initial client render) always use `defaultValue`
 * to avoid hydration mismatches. The stored value is applied in a useEffect,
 * so there may be a single silent re-render on mount.
 */
export function usePersistedState<T>(
  storageKey: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);
  // Track whether we've loaded from storage so we don't write the defaultValue
  // back on the very first effect run before loading.
  const hydrated = useRef(false);

  // Load stored value once on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        setState(JSON.parse(stored) as T);
      }
    } catch {
      // Corrupted JSON or storage unavailable — just use default.
    }
    hydrated.current = true;
  // Intentionally only runs once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist every subsequent state change.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Private browsing / quota exceeded — silently ignore.
    }
  }, [storageKey, state]);

  return [state, setState];
}
