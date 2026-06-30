import { requireUser } from "@/lib/session-helpers";
import { prisma } from "@/lib/db";
import { isolationFilter } from "@/lib/isolation";
import {
  groupCompletionPlayerSelect,
  mapGroupCompletionPlayers,
} from "@/lib/levels-grid";
import { LevelsSubNav, ScoresClient } from "../levels-client";

interface Props {
  searchParams: Promise<{ playerId?: string }>;
}

export default async function ScoresPage({ searchParams }: Props) {
  const currentUser = await requireUser();
  const isolation = isolationFilter(currentUser);
  const { playerId } = await searchParams;

  const players = await prisma.user.findMany({
    where: { ...isolation, isActive: true },
    orderBy: { currentScore: "desc" },
    select: groupCompletionPlayerSelect,
  });

  const playerOptions = mapGroupCompletionPlayers(players);
  const requestedPlayerExists = playerOptions.some(
    (player) => player.id === playerId,
  );
  const initialPlayerId = requestedPlayerExists
    ? playerId!
    : currentUser.id;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="mb-2 text-2xl font-bold text-foreground">Levels</h1>
      <p className="mb-4 text-sm text-muted">
        Scores across every game and level at Activate.
      </p>
      <LevelsSubNav />
      <ScoresClient
        currentUserId={currentUser.id}
        initialPlayerId={initialPlayerId}
        initialPlayers={playerOptions}
      />
    </div>
  );
}
