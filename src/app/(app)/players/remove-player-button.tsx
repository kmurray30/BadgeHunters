"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeAddedPlayer } from "@/app/actions/players";

interface RemovePlayerButtonProps {
  playerId: string;
  name: string;
  redirectTo?: string;
  /** "icon": a small trash can for inside a list card (which is itself a link) */
  variant?: "icon" | "text";
}

/** Remove a player someone added who hasn't signed up. */
export function RemovePlayerButton({ playerId, name, redirectTo, variant = "text" }: RemovePlayerButtonProps) {
  const router = useRouter();
  const [removing, startRemoving] = useTransition();

  function remove(event: React.SyntheticEvent) {
    // Inside a card link: don't navigate.
    event.preventDefault();
    event.stopPropagation();
    if (removing || !window.confirm(`Remove ${name} from the site? You can add them back any time.`)) return;
    startRemoving(async () => {
      const result = await removeAddedPlayer(playerId);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  if (variant === "icon") {
    // A span, not a button: it sits inside the card's <a>.
    return (
      <span
        role="button"
        tabIndex={0}
        aria-label={`Remove ${name}`}
        title={`Remove ${name}`}
        onClick={remove}
        onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && remove(event)}
        className={`ml-1 inline-flex h-6 w-6 items-center justify-center rounded-md align-middle text-muted transition hover:bg-danger/15 hover:text-danger ${removing ? "opacity-40" : ""}`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={removing}
      onClick={remove}
      className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
    >
      {removing ? "Removing…" : "Remove"}
    </button>
  );
}
