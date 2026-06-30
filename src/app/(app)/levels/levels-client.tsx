"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LevelScoreGrid } from "@/components/level-score-grid";
import type {
  GroupCompletionPlayerOption,
  LevelRoomGroup,
} from "@/lib/levels-grid";

export function LevelsSubNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/levels/scores", label: "Scores" },
    { href: "/levels/group-completion", label: "Group Completion" },
  ];

  return (
    <div className="mb-6 flex gap-1 rounded-lg border border-border p-0.5 w-fit">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function EmptyLevelsState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <p className="text-sm text-muted">
        {message ??
          "No level score data yet. Run a sync to pull scores from PlayActivate."}
      </p>
      <Link
        href="/sync"
        className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
      >
        Go to Sync →
      </Link>
    </div>
  );
}

export function ScoresClient({
  currentUserId,
  initialPlayerId,
  initialPlayers,
}: {
  currentUserId: string;
  initialPlayerId: string;
  initialPlayers: GroupCompletionPlayerOption[];
}) {
  const router = useRouter();
  const [players] = useState(initialPlayers);
  const [selectedPlayerId, setSelectedPlayerId] = useState(initialPlayerId);
  const [rooms, setRooms] = useState<LevelRoomGroup[]>([]);
  const [hasData, setHasData] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    setSelectedPlayerId(initialPlayerId);
  }, [initialPlayerId]);

  useEffect(() => {
    async function loadScores() {
      if (hasLoadedOnce.current) {
        setIsRefreshing(true);
      }
      try {
        const response = await fetch(
          `/api/levels/scores?playerId=${encodeURIComponent(selectedPlayerId)}`,
        );
        if (response.ok) {
          const data = await response.json();
          setRooms(data.rooms ?? []);
          setHasData(data.hasData ?? false);
        }
      } finally {
        hasLoadedOnce.current = true;
        setIsInitialLoad(false);
        setIsRefreshing(false);
      }
    }
    loadScores();
  }, [selectedPlayerId]);

  function selectPlayer(playerId: string) {
    setSelectedPlayerId(playerId);
    const query =
      playerId === currentUserId
        ? ""
        : `?playerId=${encodeURIComponent(playerId)}`;
    router.replace(`/levels/scores${query}`, { scroll: false });
  }

  const picker = (
    <ScoresPlayerPicker
      currentUserId={currentUserId}
      players={players}
      selectedPlayerId={selectedPlayerId}
      isRefreshing={isRefreshing}
      onSelect={selectPlayer}
    />
  );

  if (isInitialLoad) {
    return (
      <>
        {picker}
        <p className="text-sm text-muted">Loading scores…</p>
      </>
    );
  }

  if (!hasData && rooms.length === 0) {
    return (
      <>
        {picker}
        <EmptyLevelsState />
      </>
    );
  }

  return (
    <>
      {picker}
      <div
        className={isRefreshing ? "pointer-events-none opacity-60" : undefined}
      >
        <LevelScoreGrid mode="my-scores" rooms={rooms} />
      </div>
    </>
  );
}

export function GroupCompletionClient({
  initialPlayers,
}: {
  initialPlayers: GroupCompletionPlayerOption[];
}) {
  const [players, setPlayers] = useState(initialPlayers);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    () => new Set(initialPlayers.map((player) => player.id)),
  );
  const [rooms, setRooms] = useState<LevelRoomGroup[]>([]);
  const [hasData, setHasData] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);

  useEffect(() => {
    async function loadCompletion() {
      if (hasLoadedOnce.current) {
        setIsRefreshing(true);
      }
      try {
        const playerIds = [...selectedPlayerIds].join(",");
        const response = await fetch(
          `/api/levels/group-completion?playerIds=${encodeURIComponent(playerIds)}`,
        );
        if (response.ok) {
          const data = await response.json();
          setRooms(data.rooms ?? []);
          setHasData(data.hasData ?? false);
          if (Array.isArray(data.players)) {
            setPlayers(data.players);
          }
        }
      } finally {
        hasLoadedOnce.current = true;
        setIsInitialLoad(false);
        setIsRefreshing(false);
      }
    }
    loadCompletion();
  }, [selectedPlayerIds]);

  function togglePlayer(playerId: string) {
    setSelectedPlayerIds((previous) => {
      const next = new Set(previous);
      if (next.has(playerId)) {
        if (next.size > 1) {
          next.delete(playerId);
        }
      } else {
        next.add(playerId);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedPlayerIds(new Set(players.map((player) => player.id)));
  }

  const picker = (
    <PlayerPicker
      players={players}
      selectedPlayerIds={selectedPlayerIds}
      isRefreshing={isRefreshing}
      onToggle={togglePlayer}
      onSelectAll={selectAll}
    />
  );

  if (isInitialLoad) {
    return (
      <>
        {picker}
        <p className="text-sm text-muted">Loading completion data…</p>
      </>
    );
  }

  if (!hasData && rooms.length === 0) {
    return (
      <>
        {picker}
        <EmptyLevelsState />
      </>
    );
  }

  return (
    <>
      {picker}
      <div
        className={isRefreshing ? "pointer-events-none opacity-60" : undefined}
      >
        <LevelScoreGrid mode="group-completion" rooms={rooms} />
      </div>
    </>
  );
}

function ScoresPlayerPicker({
  players,
  selectedPlayerId,
  currentUserId,
  isRefreshing,
  onSelect,
}: {
  players: GroupCompletionPlayerOption[];
  selectedPlayerId: string;
  currentUserId: string;
  isRefreshing?: boolean;
  onSelect: (playerId: string) => void;
}) {
  return (
    <div className="sticky top-14 z-40 -mx-4 mb-4 border-b border-border bg-card/95 px-4 py-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Player</h2>
        {isRefreshing ? (
          <span className="text-xs text-muted">Updating…</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => {
          const isSelected = selectedPlayerId === player.id;
          const isCurrentUser = player.id === currentUserId;
          const label = player.isSynced
            ? isCurrentUser
              ? `${player.displayName} (you)`
              : player.displayName
            : `${player.displayName} (not synced)`;

          return (
            <button
              key={player.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(player.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                player.isSynced
                  ? isSelected
                    ? "bg-accent text-white"
                    : "border border-border text-muted hover:text-foreground"
                  : isSelected
                    ? "bg-accent/40 text-muted"
                    : "border border-border text-muted/50 hover:text-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PlayerPicker({
  players,
  selectedPlayerIds,
  isRefreshing,
  onToggle,
  onSelectAll,
}: {
  players: GroupCompletionPlayerOption[];
  selectedPlayerIds: Set<string>;
  isRefreshing?: boolean;
  onToggle: (playerId: string) => void;
  onSelectAll: () => void;
}) {
  return (
    <div className="sticky top-14 z-40 -mx-4 mb-4 border-b border-border bg-card/95 px-4 py-4 backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Players</h2>
        <div className="flex items-center gap-3">
          {isRefreshing ? (
            <span className="text-xs text-muted">Updating…</span>
          ) : null}
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onSelectAll}
            className="text-xs text-accent hover:underline"
          >
            Select all
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((player) => {
          const isSelected = selectedPlayerIds.has(player.id);
          const label = player.isSynced
            ? player.displayName
            : `${player.displayName} (not synced)`;

          return (
            <button
              key={player.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onToggle(player.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                player.isSynced
                  ? isSelected
                    ? "bg-accent text-white"
                    : "border border-border text-muted hover:text-foreground"
                  : isSelected
                    ? "bg-accent/40 text-muted"
                    : "border border-border text-muted/50 hover:text-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted">
        {selectedPlayerIds.size} of {players.length} selected — cells show who
        has completed each level (3-letter abbreviations)
      </p>
    </div>
  );
}
