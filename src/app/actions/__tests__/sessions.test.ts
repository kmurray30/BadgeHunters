/**
 * Unit tests for the session state machine.
 *
 * Tests the server actions in sessions.ts against the spec in
 * docs/session-state-machine.md. Prisma is mocked with an in-memory store
 * so multi-step flows (complete → reopen → complete) actually track state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory store ──────────────────────────────────────────────────────
// Simulates the subset of Prisma tables the session actions touch.

interface SessionRow {
  id: string;
  status: string;
  createdByUserId: string;
  sessionDateLocal: Date;
  expiresAt: Date;
  completedAt: Date | null;
  completedByUserId: string | null;
}
interface MemberRow { id: string; sessionId: string; userId: string; addedByUserId: string }
interface AckRow { id: string; sessionId: string; userId: string; needsReview: boolean; acknowledgedAt: Date | null }
interface NotifRow { id: string; userId: string; type: string; sessionId: string }
interface GhostRow { id: string; sessionId: string; displayName: string }
interface SelectionRow { id: string; sessionId: string; badgeId: string; selectedByUserId: string }
interface CompletionRow { id: string; sessionId: string; userId: string; badgeId: string }
interface BadgeStatusRow { id: string; userId: string; badgeId: string; isCompleted: boolean; completedAt: Date | null }

let store: {
  sessions: SessionRow[];
  members: MemberRow[];
  acks: AckRow[];
  notifications: NotifRow[];
  ghosts: GhostRow[];
  selections: SelectionRow[];
  completions: CompletionRow[];
  badgeStatuses: BadgeStatusRow[];
};

let idCounter: number;
function nextId() { return `id-${++idCounter}`; }

function resetStore() {
  idCounter = 0;
  store = {
    sessions: [],
    members: [],
    acks: [],
    notifications: [],
    ghosts: [],
    selections: [],
    completions: [],
    badgeStatuses: [],
  };
}

// ── Where-clause matcher ─────────────────────────────────────────────────
// Handles the Prisma where patterns used by the actions:
//   { field: value }
//   { field: { not: value } }
//   compound keys like { sessionId_userId: { sessionId, userId } }

function matchesWhere<T extends Record<string, unknown>>(row: T, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    // Compound key (e.g. sessionId_userId, sessionId_badgeId_selectedByUserId)
    if (typeof value === "object" && value !== null && !Array.isArray(value) && key.includes("_")) {
      const compoundFields = value as Record<string, unknown>;
      for (const [compoundKey, compoundValue] of Object.entries(compoundFields)) {
        if (row[compoundKey] !== compoundValue) return false;
      }
      continue;
    }
    // { field: { not: value } }
    if (typeof value === "object" && value !== null && "not" in (value as Record<string, unknown>)) {
      if (row[key] === (value as Record<string, unknown>).not) return false;
      continue;
    }
    // Simple equality
    if (row[key] !== value) return false;
  }
  return true;
}

// ── Build Prisma mock ────────────────────────────────────────────────────

function buildTableMock<T extends Record<string, unknown>>(
  getRows: () => T[],
  setRows: (rows: T[]) => void,
) {
  return {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return getRows().find((row) => matchesWhere(row, where)) ?? null;
    }),
    findMany: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> } = {}) => {
      let results = where ? getRows().filter((row) => matchesWhere(row, where)) : [...getRows()];
      if (select) {
        results = results.map((row) => {
          const picked: Record<string, unknown> = {};
          for (const key of Object.keys(select)) picked[key] = row[key];
          return picked as T;
        });
      }
      return results;
    }),
    count: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      return where ? getRows().filter((row) => matchesWhere(row, where)).length : getRows().length;
    }),
    create: vi.fn(async ({ data }: { data: Partial<T> & Record<string, unknown> }) => {
      const row = { id: nextId(), ...data } as T;
      setRows([...getRows(), row]);
      return row;
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Partial<T>> }) => {
      const newRows = data.map((datum) => {
        const row = { id: nextId(), ...datum } as T;
        // Simulate Prisma defaults for ack rows
        if ("needsReview" in row === false && "sessionId" in row && "userId" in row) {
          (row as Record<string, unknown>).needsReview = true;
          (row as Record<string, unknown>).acknowledgedAt = null;
        }
        return row;
      });
      setRows([...getRows(), ...newRows]);
      return { count: newRows.length };
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<T> }) => {
      const rows = getRows();
      const index = rows.findIndex((row) => matchesWhere(row, where));
      if (index === -1) throw new Error(`Record not found for update: ${JSON.stringify(where)}`);
      rows[index] = { ...rows[index], ...data };
      setRows([...rows]);
      return rows[index];
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<T> }) => {
      const rows = getRows();
      let count = 0;
      const updated = rows.map((row) => {
        if (matchesWhere(row, where)) { count++; return { ...row, ...data }; }
        return row;
      });
      setRows(updated);
      return { count };
    }),
    delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const rows = getRows();
      const index = rows.findIndex((row) => matchesWhere(row, where));
      if (index === -1) throw new Error(`Record not found for delete: ${JSON.stringify(where)}`);
      const deleted = rows[index];
      setRows(rows.filter((_, i) => i !== index));
      return deleted;
    }),
    deleteMany: vi.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const before = getRows().length;
      setRows(where ? getRows().filter((row) => !matchesWhere(row, where)) : []);
      return { count: before - getRows().length };
    }),
    upsert: vi.fn(async ({ where, create, update: updateData }: { where: Record<string, unknown>; create: Partial<T>; update: Partial<T> }) => {
      const existing = getRows().find((row) => matchesWhere(row, where));
      if (existing) {
        Object.assign(existing, updateData);
        setRows([...getRows()]);
        return existing;
      }
      const row = { id: nextId(), ...create } as T;
      setRows([...getRows(), row]);
      return row;
    }),
  };
}

// ── Mock wiring ──────────────────────────────────────────────────────────

let currentUserId = "user-A";

vi.mock("@/lib/session-helpers", () => ({
  requireUser: vi.fn(async () => ({ id: currentUserId })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Build a mock that uses closures over `store` so it always reads live state
function buildPrismaMock() {
  return {
    session: {
      ...buildTableMock<SessionRow>(() => store.sessions, (rows) => { store.sessions = rows; }),
      // Override create to handle nested members/ghostMembers
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const sessionId = nextId();
        const row: SessionRow = {
          id: sessionId,
          status: "active",
          createdByUserId: data.createdByUserId as string,
          sessionDateLocal: data.sessionDateLocal as Date,
          expiresAt: data.expiresAt as Date,
          completedAt: null,
          completedByUserId: null,
        };
        store.sessions.push(row);

        // Handle nested members.create
        const membersCreate = (data.members as Record<string, unknown>)?.create;
        if (Array.isArray(membersCreate)) {
          for (const memberData of membersCreate) {
            store.members.push({ id: nextId(), sessionId, ...(memberData as Record<string, string>) } as MemberRow);
          }
        }

        // Handle nested ghostMembers.create
        const ghostsCreate = (data.ghostMembers as Record<string, unknown>)?.create;
        if (Array.isArray(ghostsCreate)) {
          for (const ghostData of ghostsCreate) {
            store.ghosts.push({ id: nextId(), sessionId, ...(ghostData as Record<string, string>) } as GhostRow);
          }
        }

        return row;
      }),
    },
    sessionMember: buildTableMock<MemberRow>(() => store.members, (rows) => { store.members = rows; }),
    sessionUserAcknowledgement: buildTableMock<AckRow>(() => store.acks, (rows) => { store.acks = rows; }),
    notification: buildTableMock<NotifRow>(() => store.notifications, (rows) => { store.notifications = rows; }),
    sessionGhostMember: buildTableMock<GhostRow>(() => store.ghosts, (rows) => { store.ghosts = rows; }),
    sessionBadgeSelection: buildTableMock<SelectionRow>(() => store.selections, (rows) => { store.selections = rows; }),
    sessionBadgeCompletion: buildTableMock<CompletionRow>(() => store.completions, (rows) => { store.completions = rows; }),
    badgeUserStatus: buildTableMock<BadgeStatusRow>(() => store.badgeStatuses, (rows) => { store.badgeStatuses = rows; }),
  };
}

const mockPrisma = buildPrismaMock();

vi.mock("@/lib/db", () => ({
  prisma: buildPrismaMock(),
}));

// We need to re-grab the mock after vi.mock processes it
import { prisma } from "@/lib/db";
const prismaMock = prisma as unknown as ReturnType<typeof buildPrismaMock>;

import {
  createSession,
  addSessionMember,
  joinSession,
  removeSessionMember,
  addGhostMember,
  removeGhostMember,
  toggleBadgeSelection,
  completeMyReview,
  cancelMyReview,
  reopenSession,
  toggleSessionBadgeCompletion,
  dismissSessionReviewNotification,
} from "@/app/actions/sessions";

// ── Helpers ──────────────────────────────────────────────────────────────

function actAs(userId: string) { currentUserId = userId; }

/** Seed a session with N members, all with needsReview: true */
function seedSession(
  sessionId: string,
  memberIds: string[],
  status: "active" | "completed_pending_ack" | "closed" = "active",
  overrides: Partial<SessionRow> = {},
) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(6, 0, 0, 0);

  store.sessions.push({
    id: sessionId,
    status,
    createdByUserId: memberIds[0],
    sessionDateLocal: new Date(),
    expiresAt: tomorrow,
    completedAt: status !== "active" ? new Date() : null,
    completedByUserId: status !== "active" ? memberIds[0] : null,
    ...overrides,
  });
  for (const memberId of memberIds) {
    store.members.push({ id: nextId(), sessionId, userId: memberId, addedByUserId: memberIds[0] });
    store.acks.push({ id: nextId(), sessionId, userId: memberId, needsReview: true, acknowledgedAt: null });
  }
}

/** Mark a user's ack as done (simulates having completed review) */
function markAckDone(sessionId: string, userId: string) {
  const ack = store.acks.find((a) => a.sessionId === sessionId && a.userId === userId);
  if (ack) { ack.needsReview = false; ack.acknowledgedAt = new Date(); }
}

function getSession(sessionId: string) {
  return store.sessions.find((s) => s.id === sessionId);
}

function getAck(sessionId: string, userId: string) {
  return store.acks.find((a) => a.sessionId === sessionId && a.userId === userId);
}

function getNotifications(sessionId: string, type?: string) {
  return store.notifications.filter((n) => n.sessionId === sessionId && (!type || n.type === type));
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  resetStore();
  currentUserId = "user-A";
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------
describe("createSession", () => {
  it("creates a session with status 'active'", async () => {
    actAs("user-A");
    const sessionId = await createSession(["user-A", "user-B"], [], "2025-04-07");
    const session = getSession(sessionId);
    expect(session?.status).toBe("active");
  });

  it("sets expiresAt to 6:00 AM the day after the session date", async () => {
    actAs("user-A");
    const sessionId = await createSession([], [], "2025-07-15");
    const session = getSession(sessionId);
    expect(session?.expiresAt.getDate()).toBe(16);
    expect(session?.expiresAt.getHours()).toBe(6);
    expect(session?.expiresAt.getMinutes()).toBe(0);
  });

  it("adds the creator as a session member", async () => {
    actAs("user-A");
    const sessionId = await createSession([], [], "2025-04-07");
    const member = store.members.find((m) => m.sessionId === sessionId && m.userId === "user-A");
    expect(member).toBeTruthy();
  });

  it("adds additional specified members", async () => {
    actAs("user-A");
    const sessionId = await createSession(["user-A", "user-B", "user-C"], [], "2025-04-07");
    const memberUserIds = store.members.filter((m) => m.sessionId === sessionId).map((m) => m.userId);
    expect(memberUserIds).toContain("user-B");
    expect(memberUserIds).toContain("user-C");
  });

  it("creates ack rows for all real members with needsReview: true", async () => {
    actAs("user-A");
    const sessionId = await createSession(["user-A", "user-B"], [], "2025-04-07");
    const acks = store.acks.filter((a) => a.sessionId === sessionId);
    expect(acks).toHaveLength(2);
    for (const ack of acks) {
      expect(ack.needsReview).toBe(true);
    }
  });

  it("does NOT create ack rows for ghost members", async () => {
    actAs("user-A");
    const sessionId = await createSession([], ["Ghost1"], "2025-04-07");
    const acks = store.acks.filter((a) => a.sessionId === sessionId);
    // Only creator gets an ack, not ghosts
    expect(acks).toHaveLength(1);
    expect(acks[0].userId).toBe("user-A");
  });

  it("sends session_added notifications to non-creator members", async () => {
    actAs("user-A");
    const sessionId = await createSession(["user-A", "user-B", "user-C"], [], "2025-04-07");
    const notifs = getNotifications(sessionId, "session_added");
    const notifiedUserIds = notifs.map((n) => n.userId);
    expect(notifiedUserIds).toContain("user-B");
    expect(notifiedUserIds).toContain("user-C");
  });

  it("does NOT send a notification to the creator", async () => {
    actAs("user-A");
    const sessionId = await createSession(["user-A", "user-B"], [], "2025-04-07");
    const notifs = getNotifications(sessionId, "session_added");
    const notifiedUserIds = notifs.map((n) => n.userId);
    expect(notifiedUserIds).not.toContain("user-A");
  });

  it("filters out empty ghost names", async () => {
    actAs("user-A");
    const sessionId = await createSession([], ["Ghost1", "", "  ", "Ghost2"], "2025-04-07");
    const ghosts = store.ghosts.filter((g) => g.sessionId === sessionId);
    expect(ghosts).toHaveLength(2);
  });

  it("deduplicates the creator from the member list", async () => {
    actAs("user-A");
    const sessionId = await createSession(["user-A", "user-A", "user-B"], [], "2025-04-07");
    const members = store.members.filter((m) => m.sessionId === sessionId && m.userId === "user-A");
    expect(members).toHaveLength(1);
  });

  it("returns the new session id", async () => {
    actAs("user-A");
    const sessionId = await createSession([], [], "2025-04-07");
    expect(sessionId).toBeTruthy();
    expect(getSession(sessionId)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// addSessionMember
// ---------------------------------------------------------------------------
describe("addSessionMember", () => {
  it("adds a member and creates an ack row", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await addSessionMember("s1", "user-B");
    expect(store.members.find((m) => m.sessionId === "s1" && m.userId === "user-B")).toBeTruthy();
    expect(store.acks.find((a) => a.sessionId === "s1" && a.userId === "user-B")).toBeTruthy();
  });

  it("sends session_added notification when adding someone else", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await addSessionMember("s1", "user-B");
    const notifs = getNotifications("s1", "session_added");
    expect(notifs.some((n) => n.userId === "user-B")).toBe(true);
  });

  it("does NOT send notification when adding yourself", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await addSessionMember("s1", "user-A");
    const notifs = getNotifications("s1", "session_added");
    expect(notifs.some((n) => n.userId === "user-A")).toBe(false);
  });

  it("throws if the caller is not a session member", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-B");
    await expect(addSessionMember("s1", "user-C")).rejects.toThrow("Only session members");
  });
});

// ---------------------------------------------------------------------------
// joinSession
// ---------------------------------------------------------------------------
describe("joinSession", () => {
  it("creates a member record and ack for the caller", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-B");
    await joinSession("s1");
    expect(store.members.find((m) => m.sessionId === "s1" && m.userId === "user-B")).toBeTruthy();
    expect(store.acks.find((a) => a.sessionId === "s1" && a.userId === "user-B")).toBeTruthy();
  });

  it("does NOT send a notification on self-join", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-B");
    await joinSession("s1");
    expect(getNotifications("s1").length).toBe(0);
  });

  it("no-ops if the user is already a member", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    const membersBefore = store.members.length;
    await joinSession("s1");
    expect(store.members.length).toBe(membersBefore);
  });
});

// ---------------------------------------------------------------------------
// removeSessionMember
// ---------------------------------------------------------------------------
describe("removeSessionMember", () => {
  it("deletes the member record", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await removeSessionMember("s1", "user-B");
    expect(store.members.find((m) => m.sessionId === "s1" && m.userId === "user-B")).toBeUndefined();
  });

  it("deletes the member's ack", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await removeSessionMember("s1", "user-B");
    expect(store.acks.find((a) => a.sessionId === "s1" && a.userId === "user-B")).toBeUndefined();
  });

  it("deletes the member's badge selections", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    store.selections.push({ id: nextId(), sessionId: "s1", badgeId: "b1", selectedByUserId: "user-B" });
    actAs("user-A");
    await removeSessionMember("s1", "user-B");
    expect(store.selections.find((s) => s.sessionId === "s1" && s.selectedByUserId === "user-B")).toBeUndefined();
  });

  it("deletes the member's notifications for this session", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    store.notifications.push({ id: nextId(), userId: "user-B", type: "session_added", sessionId: "s1" });
    actAs("user-A");
    await removeSessionMember("s1", "user-B");
    expect(getNotifications("s1").filter((n) => n.userId === "user-B")).toHaveLength(0);
  });

  it("throws if the caller is not a session member", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-C");
    await expect(removeSessionMember("s1", "user-A")).rejects.toThrow("Only session members");
  });
});

// ---------------------------------------------------------------------------
// completeMyReview
// ---------------------------------------------------------------------------
describe("completeMyReview", () => {
  it("transitions session from active to completed_pending_ack", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await completeMyReview("s1");
    expect(getSession("s1")?.status).toBe("completed_pending_ack");
  });

  it("sets completedAt and completedByUserId when transitioning from active", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await completeMyReview("s1");
    const session = getSession("s1");
    expect(session?.completedAt).toBeInstanceOf(Date);
    expect(session?.completedByUserId).toBe("user-A");
  });

  it("does NOT overwrite completedAt or completedByUserId if already completed_pending_ack", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack", {
      completedByUserId: "user-A",
      completedAt: new Date("2025-01-01"),
    });
    actAs("user-B");
    await completeMyReview("s1");
    const session = getSession("s1");
    expect(session?.completedByUserId).toBe("user-A");
  });

  it("marks the caller's ack as done (needsReview: false, acknowledgedAt set)", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await completeMyReview("s1");
    const ack = getAck("s1", "user-A");
    expect(ack?.needsReview).toBe(false);
    expect(ack?.acknowledgedAt).toBeInstanceOf(Date);
  });

  it("deletes the caller's session_review notification if one exists", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    store.notifications.push({ id: nextId(), userId: "user-A", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await completeMyReview("s1");
    expect(getNotifications("s1", "session_review").find((n) => n.userId === "user-A")).toBeUndefined();
  });

  it("does not error if caller has no session_review notification to delete", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await expect(completeMyReview("s1")).resolves.not.toThrow();
  });

  it("sends session_review notifications to members who still need review", async () => {
    seedSession("s1", ["user-A", "user-B", "user-C"]);
    actAs("user-A");
    await completeMyReview("s1");
    const notifs = getNotifications("s1", "session_review");
    const notifiedUserIds = notifs.map((n) => n.userId);
    expect(notifiedUserIds).toContain("user-B");
    expect(notifiedUserIds).toContain("user-C");
  });

  it("skips members who have already completed their review (needsReview: false)", async () => {
    seedSession("s1", ["user-A", "user-B", "user-C"], "completed_pending_ack");
    markAckDone("s1", "user-B");
    actAs("user-A");
    await completeMyReview("s1");
    const notifs = getNotifications("s1", "session_review");
    const notifiedUserIds = notifs.map((n) => n.userId);
    expect(notifiedUserIds).not.toContain("user-B");
    expect(notifiedUserIds).toContain("user-C");
  });

  it("does not send duplicate notifications to members who already have one", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    store.notifications.push({ id: nextId(), userId: "user-B", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await completeMyReview("s1");
    const bNotifs = getNotifications("s1", "session_review").filter((n) => n.userId === "user-B");
    expect(bNotifs).toHaveLength(1);
  });

  it("sends no notifications when there are no other pending members", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    const notifsBefore = store.notifications.length;
    await completeMyReview("s1");
    expect(getNotifications("s1", "session_review")).toHaveLength(0);
  });

  it("auto-closes session when the last member completes", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await completeMyReview("s1");
    actAs("user-B");
    await completeMyReview("s1");
    expect(getSession("s1")?.status).toBe("closed");
  });

  it("cleans up all session_review notifications on auto-close", async () => {
    seedSession("s1", ["user-A", "user-B"]);
    actAs("user-A");
    await completeMyReview("s1");
    actAs("user-B");
    await completeMyReview("s1");
    expect(getNotifications("s1", "session_review")).toHaveLength(0);
  });

  it("silently no-ops if the session does not exist (stale tab)", async () => {
    actAs("user-A");
    await expect(completeMyReview("nonexistent")).resolves.not.toThrow();
  });

  it("silently no-ops if the session is already closed (stale tab)", async () => {
    seedSession("s1", ["user-A"], "closed");
    actAs("user-A");
    await expect(completeMyReview("s1")).resolves.not.toThrow();
  });

  it("does NOT throw if session is active", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await expect(completeMyReview("s1")).resolves.not.toThrow();
  });

  it("does NOT throw if session is completed_pending_ack", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    actAs("user-A");
    await expect(completeMyReview("s1")).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// cancelMyReview
// ---------------------------------------------------------------------------
describe("cancelMyReview", () => {
  it("resets the caller's ack to needsReview: true, acknowledgedAt: null", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    actAs("user-A");
    await cancelMyReview("s1");
    const ack = getAck("s1", "user-A");
    expect(ack?.needsReview).toBe(true);
    expect(ack?.acknowledgedAt).toBeNull();
  });

  it("deletes the caller's session_review notification", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    store.notifications.push({ id: nextId(), userId: "user-A", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await cancelMyReview("s1");
    expect(getNotifications("s1", "session_review").find((n) => n.userId === "user-A")).toBeUndefined();
  });

  it("does NOT change other members' ack states", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-B");
    actAs("user-A");
    await cancelMyReview("s1");
    const bAck = getAck("s1", "user-B");
    expect(bAck?.needsReview).toBe(false);
  });

  it("does NOT delete other members' session_review notifications", async () => {
    // Need a 3rd member (C) who is also done so session doesn't revert to active
    seedSession("s1", ["user-A", "user-B", "user-C"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-C");
    store.notifications.push({ id: nextId(), userId: "user-B", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await cancelMyReview("s1");
    expect(getNotifications("s1", "session_review").find((n) => n.userId === "user-B")).toBeTruthy();
  });

  it("does NOT change session status when other members are still done", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-B");
    actAs("user-A");
    await cancelMyReview("s1");
    expect(getSession("s1")?.status).toBe("completed_pending_ack");
  });

  it("reverts session to active when all acks are needsReview: true", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    // user-B still needsReview: true. After A cancels, all are needsReview → revert.
    actAs("user-A");
    await cancelMyReview("s1");
    expect(getSession("s1")?.status).toBe("active");
  });

  it("clears completedAt and completedByUserId on revert to active", async () => {
    seedSession("s1", ["user-A"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    actAs("user-A");
    await cancelMyReview("s1");
    const session = getSession("s1");
    expect(session?.completedAt).toBeNull();
    expect(session?.completedByUserId).toBeNull();
  });

  it("cleans up all session_review notifications on revert to active", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    store.notifications.push({ id: nextId(), userId: "user-B", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await cancelMyReview("s1");
    expect(getNotifications("s1", "session_review")).toHaveLength(0);
  });

  it("does NOT revert a closed session to active even if all acks reset", async () => {
    seedSession("s1", ["user-A"], "closed");
    markAckDone("s1", "user-A");
    actAs("user-A");
    await cancelMyReview("s1");
    // cancelMyReview only checks completed_pending_ack, not closed
    expect(getSession("s1")?.status).toBe("closed");
  });

  it("server action does NOT enforce expiresAt date restriction (UI-only guard)", async () => {
    // Even with a past expiresAt, the action succeeds
    const pastExpiry = new Date();
    pastExpiry.setDate(pastExpiry.getDate() - 5);
    seedSession("s1", ["user-A"], "completed_pending_ack", { expiresAt: pastExpiry });
    markAckDone("s1", "user-A");
    actAs("user-A");
    await expect(cancelMyReview("s1")).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// reopenSession
// ---------------------------------------------------------------------------
describe("reopenSession", () => {
  it("resets only the caller's ack to needsReview: true", async () => {
    seedSession("s1", ["user-A", "user-B"], "closed");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-B");
    actAs("user-A");
    await reopenSession("s1");
    expect(getAck("s1", "user-A")?.needsReview).toBe(true);
    expect(getAck("s1", "user-A")?.acknowledgedAt).toBeNull();
  });

  it("deletes the caller's session_review notification", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    store.notifications.push({ id: nextId(), userId: "user-A", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await reopenSession("s1");
    expect(getNotifications("s1", "session_review").find((n) => n.userId === "user-A")).toBeUndefined();
  });

  it("always transitions to active from closed", async () => {
    seedSession("s1", ["user-A", "user-B"], "closed");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-B");
    actAs("user-A");
    await reopenSession("s1");
    expect(getSession("s1")?.status).toBe("active");
  });

  it("always transitions to active from completed_pending_ack", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-B");
    actAs("user-A");
    await reopenSession("s1");
    expect(getSession("s1")?.status).toBe("active");
  });

  it("resets ALL members' acks to needsReview (not just the caller)", async () => {
    seedSession("s1", ["user-A", "user-B", "user-C"], "closed");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-B");
    markAckDone("s1", "user-C");
    actAs("user-A");
    await reopenSession("s1");
    expect(getAck("s1", "user-A")?.needsReview).toBe(true);
    expect(getAck("s1", "user-B")?.needsReview).toBe(true);
    expect(getAck("s1", "user-C")?.needsReview).toBe(true);
  });

  it("clears completedAt and completedByUserId", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    markAckDone("s1", "user-B");
    actAs("user-A");
    await reopenSession("s1");
    const session = getSession("s1");
    expect(session?.completedAt).toBeNull();
    expect(session?.completedByUserId).toBeNull();
  });

  it("cleans up all session_review notifications", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    store.notifications.push({ id: nextId(), userId: "user-B", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await reopenSession("s1");
    expect(getNotifications("s1", "session_review")).toHaveLength(0);
  });

  it("silently no-ops if the session is still active (stale tab)", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await expect(reopenSession("s1")).resolves.not.toThrow();
  });

  it("silently no-ops if the session does not exist (stale tab)", async () => {
    actAs("user-A");
    await expect(reopenSession("nonexistent")).resolves.not.toThrow();
  });

  it("accepts completed_pending_ack sessions (not just closed)", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    markAckDone("s1", "user-A");
    actAs("user-A");
    await expect(reopenSession("s1")).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Multi-user scenarios
// ---------------------------------------------------------------------------
describe("multi-user state machine scenarios", () => {
  describe("2-player: basic complete flow", () => {
    it("A completes → session becomes completed_pending_ack", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("completed_pending_ack");
    });

    it("A completes → B receives session_review notification", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      expect(getNotifications("s1", "session_review").some((n) => n.userId === "user-B")).toBe(true);
    });

    it("A completes → A's ack is done, B's ack is still needsReview", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      expect(getAck("s1", "user-A")?.needsReview).toBe(false);
      expect(getAck("s1", "user-B")?.needsReview).toBe(true);
    });

    it("B completes → session auto-closes", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      actAs("user-B");
      await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("closed");
    });

    it("B completes → all session_review notifications cleaned up", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      actAs("user-B");
      await completeMyReview("s1");
      expect(getNotifications("s1", "session_review")).toHaveLength(0);
    });
  });

  describe("2-player: re-open after one completes", () => {
    it("A re-opens → session goes to active, ALL acks reset", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      await reopenSession("s1");
      expect(getSession("s1")?.status).toBe("active");
      expect(getAck("s1", "user-A")?.needsReview).toBe(true);
      expect(getAck("s1", "user-B")?.needsReview).toBe(true);
    });
  });

  describe("2-player: re-open from closed", () => {
    it("A re-opens closed session → active (not stuck in review)", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      actAs("user-B");
      await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("closed");
      actAs("user-A");
      await reopenSession("s1");
      expect(getSession("s1")?.status).toBe("active");
    });

    it("A re-opens → B's ack is also reset (no dead zone)", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      actAs("user-B");
      await completeMyReview("s1");
      actAs("user-A");
      await reopenSession("s1");
      expect(getAck("s1", "user-B")?.needsReview).toBe(true);
    });
  });

  describe("2-player: re-open never creates dead zone for other user", () => {
    it("after re-open, session is active AND all acks are needsReview (everyone has Review button)", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      actAs("user-B");
      await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("closed");

      actAs("user-A");
      await reopenSession("s1");

      // Session is active — clean slate
      expect(getSession("s1")?.status).toBe("active");
      // ALL acks reset — everyone sees "Review" button, nobody stuck
      expect(getAck("s1", "user-A")?.needsReview).toBe(true);
      expect(getAck("s1", "user-B")?.needsReview).toBe(true);
    });
  });

  describe("3-player: re-open resets everything", () => {
    it("A re-opens from closed → active, all 3 acks reset", async () => {
      seedSession("s1", ["user-A", "user-B", "user-C"]);
      actAs("user-A"); await completeMyReview("s1");
      actAs("user-B"); await completeMyReview("s1");
      actAs("user-C"); await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("closed");

      actAs("user-A"); await reopenSession("s1");
      expect(getSession("s1")?.status).toBe("active");
      expect(getAck("s1", "user-A")?.needsReview).toBe(true);
      expect(getAck("s1", "user-B")?.needsReview).toBe(true);
      expect(getAck("s1", "user-C")?.needsReview).toBe(true);
    });
  });

  describe("solo session", () => {
    it("solo complete → immediately closes (no pending_ack limbo)", async () => {
      seedSession("s1", ["user-A"]);
      actAs("user-A");
      await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("closed");
    });

    it("solo complete → no session_review notifications sent", async () => {
      seedSession("s1", ["user-A"]);
      actAs("user-A");
      await completeMyReview("s1");
      expect(getNotifications("s1", "session_review")).toHaveLength(0);
    });
  });

  describe("notification lifecycle", () => {
    it("A completes → B notified. B completes → no new notifications created", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      const notifsAfterA = getNotifications("s1", "session_review").length;

      actAs("user-B");
      await completeMyReview("s1");
      // Session closed → notifications cleaned, no new ones created
      expect(getNotifications("s1", "session_review")).toHaveLength(0);
    });

    it("auto-close deletes all session_review notifications for the session", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      expect(getNotifications("s1", "session_review").length).toBeGreaterThan(0);

      actAs("user-B");
      await completeMyReview("s1");
      expect(getNotifications("s1", "session_review")).toHaveLength(0);
    });

    it("revert to active (all cancel) deletes all session_review notifications", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      expect(getNotifications("s1", "session_review").length).toBeGreaterThan(0);

      actAs("user-A");
      await cancelMyReview("s1");
      // A was the only done one, so all needsReview → revert to active
      expect(getNotifications("s1", "session_review")).toHaveLength(0);
    });

    it("re-complete after re-open does not double-notify if notification still exists", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      // B now has a notification
      expect(getNotifications("s1", "session_review").filter((n) => n.userId === "user-B")).toHaveLength(1);

      // A re-opens (reverts to active since A was only done one → clears notifs)
      actAs("user-A");
      await reopenSession("s1");

      // A completes again
      actAs("user-A");
      await completeMyReview("s1");
      // B should get exactly one notification, not two
      expect(getNotifications("s1", "session_review").filter((n) => n.userId === "user-B")).toHaveLength(1);
    });

    it("re-complete DOES notify if previous notification was already cleared", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");

      // Simulate B reading/clearing their notification
      store.notifications = store.notifications.filter(
        (n) => !(n.sessionId === "s1" && n.userId === "user-B" && n.type === "session_review")
      );

      // A re-opens
      actAs("user-A");
      await reopenSession("s1");

      // A completes again → B has no notification, so should get a new one
      actAs("user-A");
      await completeMyReview("s1");
      expect(getNotifications("s1", "session_review").filter((n) => n.userId === "user-B")).toHaveLength(1);
    });
  });

  describe("cancel scenarios", () => {
    it("cancel by someone who hasn't completed does not revert session", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      // B hasn't completed. B cancels — this is a no-op on B's already-pending ack.
      // But it should NOT revert the session (A is still done).
      actAs("user-B");
      await cancelMyReview("s1");
      expect(getSession("s1")?.status).toBe("completed_pending_ack");
    });

    it("cancel on a closed session does not revert to active", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A"); await completeMyReview("s1");
      actAs("user-B"); await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("closed");

      actAs("user-A");
      await cancelMyReview("s1");
      // cancelMyReview only checks completed_pending_ack for revert
      expect(getSession("s1")?.status).toBe("closed");
    });

    it("sole completer canceling reverts session to active", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      actAs("user-A");
      await cancelMyReview("s1");
      expect(getSession("s1")?.status).toBe("active");
    });
  });

  describe("complete → re-open → complete round-trip", () => {
    it("round-trip works without errors", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      await reopenSession("s1");
      await expect(completeMyReview("s1")).resolves.not.toThrow();
    });

    it("session ends up in correct state after re-complete", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      await reopenSession("s1");
      await completeMyReview("s1");
      expect(getSession("s1")?.status).toBe("completed_pending_ack");
      expect(getAck("s1", "user-A")?.needsReview).toBe(false);
    });

    it("completedByUserId is set correctly after re-complete", async () => {
      seedSession("s1", ["user-A", "user-B"]);
      actAs("user-A");
      await completeMyReview("s1");
      await reopenSession("s1");
      await completeMyReview("s1");
      expect(getSession("s1")?.completedByUserId).toBe("user-A");
    });
  });
});

// ---------------------------------------------------------------------------
// dismissSessionReviewNotification — auto-dismiss when viewing session
// ---------------------------------------------------------------------------
describe("dismissSessionReviewNotification", () => {
  it("deletes the caller's session_review notification for the given session", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    store.notifications.push({ id: nextId(), userId: "user-A", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await dismissSessionReviewNotification("s1");
    expect(getNotifications("s1", "session_review").find((n) => n.userId === "user-A")).toBeUndefined();
  });

  it("does NOT delete other users' notifications", async () => {
    seedSession("s1", ["user-A", "user-B"], "completed_pending_ack");
    store.notifications.push({ id: nextId(), userId: "user-A", type: "session_review", sessionId: "s1" });
    store.notifications.push({ id: nextId(), userId: "user-B", type: "session_review", sessionId: "s1" });
    actAs("user-A");
    await dismissSessionReviewNotification("s1");
    expect(getNotifications("s1", "session_review").find((n) => n.userId === "user-B")).toBeTruthy();
  });

  it("does NOT delete non-review notifications", async () => {
    seedSession("s1", ["user-A"]);
    store.notifications.push({ id: nextId(), userId: "user-A", type: "session_added", sessionId: "s1" });
    actAs("user-A");
    await dismissSessionReviewNotification("s1");
    expect(store.notifications.find((n) => n.userId === "user-A" && n.type === "session_added")).toBeTruthy();
  });

  it("silently no-ops if no notification exists", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await expect(dismissSessionReviewNotification("s1")).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Silent error handling — stale tabs / redundant actions
// ---------------------------------------------------------------------------
describe("stale tab error handling", () => {
  it("completeMyReview silently no-ops if session is already closed", async () => {
    seedSession("s1", ["user-A"], "closed");
    actAs("user-A");
    await expect(completeMyReview("s1")).resolves.not.toThrow();
  });

  it("completeMyReview silently no-ops if session does not exist", async () => {
    actAs("user-A");
    await expect(completeMyReview("nonexistent")).resolves.not.toThrow();
  });

  it("reopenSession silently no-ops if session is still active", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await expect(reopenSession("s1")).resolves.not.toThrow();
  });

  it("reopenSession silently no-ops if session does not exist", async () => {
    actAs("user-A");
    await expect(reopenSession("nonexistent")).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// toggleBadgeSelection
// ---------------------------------------------------------------------------
describe("toggleBadgeSelection", () => {
  it("creates a selection record if none exists", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await toggleBadgeSelection("s1", "badge-1");
    expect(store.selections.find((s) => s.sessionId === "s1" && s.badgeId === "badge-1")).toBeTruthy();
  });

  it("deletes the selection record if it already exists", async () => {
    seedSession("s1", ["user-A"]);
    store.selections.push({ id: nextId(), sessionId: "s1", badgeId: "badge-1", selectedByUserId: "user-A" });
    actAs("user-A");
    await toggleBadgeSelection("s1", "badge-1");
    expect(store.selections.find((s) => s.sessionId === "s1" && s.badgeId === "badge-1")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toggleSessionBadgeCompletion
// ---------------------------------------------------------------------------
describe("toggleSessionBadgeCompletion", () => {
  it("creates a session completion record and marks badge as persistently completed", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await toggleSessionBadgeCompletion("s1", "badge-1");
    expect(store.completions.find((c) => c.sessionId === "s1" && c.badgeId === "badge-1")).toBeTruthy();
    const badgeStatus = store.badgeStatuses.find((b) => b.userId === "user-A" && b.badgeId === "badge-1");
    expect(badgeStatus?.isCompleted).toBe(true);
  });

  it("deletes the session completion record on uncheck", async () => {
    seedSession("s1", ["user-A"]);
    store.completions.push({ id: "comp-1", sessionId: "s1", userId: "user-A", badgeId: "badge-1" });
    actAs("user-A");
    await toggleSessionBadgeCompletion("s1", "badge-1");
    expect(store.completions.find((c) => c.sessionId === "s1" && c.badgeId === "badge-1")).toBeUndefined();
  });

  it("also clears persistent completion when alsoUncompletePersistently is true", async () => {
    seedSession("s1", ["user-A"]);
    store.completions.push({ id: "comp-1", sessionId: "s1", userId: "user-A", badgeId: "badge-1" });
    store.badgeStatuses.push({ id: "bs-1", userId: "user-A", badgeId: "badge-1", isCompleted: true, completedAt: new Date() });
    actAs("user-A");
    await toggleSessionBadgeCompletion("s1", "badge-1", true);
    const badgeStatus = store.badgeStatuses.find((b) => b.userId === "user-A" && b.badgeId === "badge-1");
    expect(badgeStatus?.isCompleted).toBe(false);
  });

  it("does NOT clear persistent completion when alsoUncompletePersistently is false", async () => {
    seedSession("s1", ["user-A"]);
    store.completions.push({ id: "comp-1", sessionId: "s1", userId: "user-A", badgeId: "badge-1" });
    store.badgeStatuses.push({ id: "bs-1", userId: "user-A", badgeId: "badge-1", isCompleted: true, completedAt: new Date() });
    actAs("user-A");
    await toggleSessionBadgeCompletion("s1", "badge-1", false);
    const badgeStatus = store.badgeStatuses.find((b) => b.userId === "user-A" && b.badgeId === "badge-1");
    expect(badgeStatus?.isCompleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// addGhostMember / removeGhostMember
// ---------------------------------------------------------------------------
describe("addGhostMember", () => {
  it("creates a ghost member with trimmed name", async () => {
    seedSession("s1", ["user-A"]);
    actAs("user-A");
    await addGhostMember("s1", "  Ghost Name  ");
    const ghost = store.ghosts.find((g) => g.sessionId === "s1");
    expect(ghost?.displayName).toBe("Ghost Name");
  });
});

describe("removeGhostMember", () => {
  it("deletes the ghost member", async () => {
    seedSession("s1", ["user-A"]);
    store.ghosts.push({ id: "ghost-1", sessionId: "s1", displayName: "Ghost" });
    actAs("user-A");
    await removeGhostMember("ghost-1");
    expect(store.ghosts.find((g) => g.id === "ghost-1")).toBeUndefined();
  });

  it("throws if ghost member not found", async () => {
    actAs("user-A");
    await expect(removeGhostMember("nonexistent")).rejects.toThrow("Ghost member not found");
  });
});
