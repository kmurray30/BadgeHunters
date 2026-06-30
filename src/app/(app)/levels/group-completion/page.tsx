import { requireUser } from "@/lib/session-helpers";
import { prisma } from "@/lib/db";
import { isolationFilter } from "@/lib/isolation";
import {
  groupCompletionPlayerSelect,
  mapGroupCompletionPlayers,
} from "@/lib/levels-grid";
import { GroupCompletionClient, LevelsSubNav } from "../levels-client";

export default async function GroupCompletionPage() {
  const currentUser = await requireUser();
  const isolation = isolationFilter(currentUser);

  const players = await prisma.user.findMany({
    where: { ...isolation, isActive: true },
    orderBy: { currentScore: "desc" },
    select: groupCompletionPlayerSelect,
  });

  const playerOptions = mapGroupCompletionPlayers(players);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Levels</h1>
      <p className="mb-4 text-sm text-muted">
        See how many players in your group have completed each level.
      </p>
      <LevelsSubNav />
      <GroupCompletionClient initialPlayers={playerOptions} />
    </div>
  );
}
