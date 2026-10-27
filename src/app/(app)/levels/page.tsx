import { requireUser } from "@/lib/session-helpers";
import { loadRoster } from "@/lib/roster";
import { loadLevelsData } from "@/lib/levels-grid";
import { LevelsClient } from "./levels-client";

export default async function LevelsPage() {
  const user = await requireUser();
  const roster = await loadRoster(user);
  const data = await loadLevelsData(roster.map((player) => player.id));

  return (
    <div className="mx-auto max-w-5xl px-4 pt-5">
      <LevelsClient data={data} roster={roster} currentUserId={user.id} />
    </div>
  );
}
