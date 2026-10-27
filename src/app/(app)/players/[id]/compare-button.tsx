"use client";

import { useRouter } from "next/navigation";

/** Select me + this player on Badges/Levels (the shared player selection) and jump there. */
export function CompareButton({ playerId, currentUserId, href, label }: { playerId: string; currentUserId: string; href: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem("bh:selected-players", JSON.stringify([...new Set([currentUserId, playerId])]));
        } catch {
          // Storage unavailable: the page opens with the default selection.
        }
        router.push(href);
      }}
      className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition hover:border-accent active:scale-95"
    >
      {label}
    </button>
  );
}
