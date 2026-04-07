"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

interface BackButtonProps {
  /** Where to go if there's no browser history (e.g. direct link / new tab) */
  fallback: string;
  /** Label text shown next to the chevron */
  label?: string;
  className?: string;
}

/**
 * Uses the browser history stack for navigation. The `label` should describe where the user
 * came from (matches `router.back()`), not only the fallback route — see `parseBackFromQuery`
 * in `@/lib/back-navigation` when linking into detail pages from specific screens.
 */
export function BackButton({ fallback, label = "Back", className }: BackButtonProps) {
  const router = useRouter();
  const hasPriorHistory = useRef(false);

  useEffect(() => {
    // If the browser has any entries before this one, we can safely call back()
    hasPriorHistory.current = window.history.length > 1;
  }, []);

  const handleClick = useCallback(() => {
    if (hasPriorHistory.current) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router, fallback]);

  return (
    <button
      onClick={handleClick}
      className={className ?? "inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
