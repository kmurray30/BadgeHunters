import { Prisma } from "@prisma/client";
import { ACTIVATE_ROOM_SLUGS, decodeRoomSlug } from "@/lib/activate-config";

export type SyncItemStatus = "pending" | "running" | "done" | "error";

export interface SyncRoomProgressItem {
  slug: string;
  label: string;
  status: SyncItemStatus;
}

export interface SyncPlayerProgressItem {
  userId: string;
  playerName: string;
  status: SyncItemStatus;
  label?: string;
}

export interface SyncProgressSnapshot {
  phase: "rooms" | "players" | "complete";
  rooms: SyncRoomProgressItem[];
  players: SyncPlayerProgressItem[];
}

export function createInitialSyncProgress(
  users: { id: string; activatePlayerName: string }[],
): SyncProgressSnapshot {
  return {
    phase: "rooms",
    rooms: ACTIVATE_ROOM_SLUGS.map((slug) => ({
      slug,
      label: decodeRoomSlug(slug),
      status: "pending",
    })),
    players: users.map((user) => ({
      userId: user.id,
      playerName: user.activatePlayerName,
      status: "pending",
    })),
  };
}

export function parseSyncProgress(value: unknown): SyncProgressSnapshot | null {
  if (value == null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.phase !== "rooms" && record.phase !== "players" && record.phase !== "complete") {
    return null;
  }
  if (!Array.isArray(record.rooms) || !Array.isArray(record.players)) return null;

  const rooms = record.rooms
    .map((entry) => {
      if (typeof entry !== "object" || entry == null) return null;
      const room = entry as Record<string, unknown>;
      if (typeof room.slug !== "string" || typeof room.label !== "string") return null;
      if (room.status !== "pending" && room.status !== "running" && room.status !== "done" && room.status !== "error") {
        return null;
      }
      return { slug: room.slug, label: room.label, status: room.status as SyncItemStatus };
    })
    .filter((entry) => entry != null) as SyncRoomProgressItem[];

  const players = record.players
    .map((entry) => {
      if (typeof entry !== "object" || entry == null) return null;
      const player = entry as Record<string, unknown>;
      if (typeof player.userId !== "string" || typeof player.playerName !== "string") {
        return null;
      }
      if (player.status !== "pending" && player.status !== "running" && player.status !== "done" && player.status !== "error") {
        return null;
      }
      const item: SyncPlayerProgressItem = {
        userId: player.userId,
        playerName: player.playerName,
        status: player.status as SyncItemStatus,
      };
      if (typeof player.label === "string") {
        item.label = player.label;
      }
      return item;
    })
    .filter((entry) => entry != null) as SyncPlayerProgressItem[];

  return { phase: record.phase, rooms, players };
}

export function countCompletedSteps(snapshot: SyncProgressSnapshot): number {
  const roomsDone = snapshot.rooms.filter((room) => room.status === "done" || room.status === "error").length;
  const playersDone = snapshot.players.filter(
    (player) => player.status === "done" || player.status === "error",
  ).length;
  return roomsDone + playersDone;
}

export function syncProgressForDb(snapshot: SyncProgressSnapshot): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
}

export function roomsCompletedCount(snapshot: SyncProgressSnapshot): number {
  return snapshot.rooms.filter((room) => room.status === "done" || room.status === "error").length;
}

export function playersCompletedCount(snapshot: SyncProgressSnapshot): number {
  return snapshot.players.filter(
    (player) => player.status === "done" || player.status === "error",
  ).length;
}

export function overallProgressLabel(snapshot: SyncProgressSnapshot): string {
  if (snapshot.phase === "complete") {
    return "Sync complete";
  }

  const done = countCompletedSteps(snapshot);
  const total = snapshot.rooms.length + snapshot.players.length;
  return `Syncing ${done}/${total}`;
}
