"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeAddedPlayer } from "@/app/actions/players";

/** Small "Remove" for players someone added who haven't signed up. */
export function RemovePlayerButton({ playerId, name, redirectTo }: { playerId: string; name: string; redirectTo?: string }) {
  const router = useRouter();
  const [removing, startRemoving] = useTransition();

  return (
    <button
      type="button"
      disabled={removing}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!window.confirm(`Remove ${name} from the site? You can add them back any time.`)) return;
        startRemoving(async () => {
          const result = await removeAddedPlayer(playerId);
          if (!result.ok) {
            window.alert(result.error);
            return;
          }
          if (redirectTo) router.push(redirectTo);
          else router.refresh();
        });
      }}
      className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted transition hover:border-danger hover:text-danger disabled:opacity-50"
    >
      {removing ? "Removing…" : "Remove"}
    </button>
  );
}
