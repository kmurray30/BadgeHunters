import { requireUser } from "@/lib/session-helpers";
import { loadBadgeCards } from "@/lib/badge-cards";
import { loadRoster } from "@/lib/roster";
import { BadgesClient } from "./badges-client";

export default async function BadgesPage() {
  const user = await requireUser();
  const roster = await loadRoster(user);
  const cards = await loadBadgeCards(user.id, roster.map((player) => player.id));

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5">
      <BadgesClient badges={cards} roster={roster} currentUserId={user.id} />
    </div>
  );
}
