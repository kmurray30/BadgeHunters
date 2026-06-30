"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface TestUser {
  id: string;
  activatePlayerName: string | null;
  realName: string | null;
  role: string;
  currentScore: number;
  rankColor: string | null;
  badgesCompleted: number;
  createdAt: string;
}

interface RealUser {
  id: string;
  displayName: string;
  activatePlayerName: string | null;
  realName: string | null;
  role: string;
  currentScore: number;
  rankColor: string | null;
  badgesCompleted: number;
  createdAt: string;
}

interface CronJobConfig {
  id: string;
  label: string;
  description: string;
  endpoint: string;
}

const CRON_JOBS: CronJobConfig[] = [
  {
    id: "session-expiry",
    label: "Trigger Session Expiry",
    description: "Check for active sessions past their 6am cutoff and transition them to pending-review state. Also runs automatically each morning via the daily cron job.",
    endpoint: "/api/cron/session-expiry",
  },
];

export function AdminClient({ initialAdminMode }: { initialAdminMode: boolean }) {
  const [adminMode, setAdminMode] = useState(initialAdminMode);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [testUsers, setTestUsers] = useState<TestUser[]>([]);
  const [realUsers, setRealUsers] = useState<RealUser[]>([]);
  const [newTestUserName, setNewTestUserName] = useState("");
  const [newRealUserName, setNewRealUserName] = useState("");
  const [testUserError, setTestUserError] = useState("");
  const [realUserError, setRealUserError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingRealUser, setIsCreatingRealUser] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<{ id: string; name: string; isTest: boolean } | null>(null);

  // Cron job state
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [jobResults, setJobResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const router = useRouter();

  useEffect(() => {
    if (adminMode) {
      fetchTestUsers();
      fetchRealUsers();
    }
  }, [adminMode]);

  async function fetchTestUsers() {
    const response = await fetch("/api/admin/test-users");
    if (response.ok) {
      const data = await response.json();
      setTestUsers(data.testUsers);
    }
  }

  async function fetchRealUsers() {
    const response = await fetch("/api/admin/real-users");
    if (response.ok) {
      const data = await response.json();
      setRealUsers(data.users);
    }
  }

  async function handleActivateAdmin() {
    setAdminError("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });

      if (response.ok) {
        setAdminMode(true);
        setAdminPassword("");
      } else {
        const data = await response.json();
        setAdminError(data.error || "Invalid password");
      }
    } catch {
      setAdminError("Failed to activate admin mode");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeactivateAdmin() {
    await fetch("/api/admin/deactivate", { method: "POST" });
    setAdminMode(false);
    setTestUsers([]);
    setRealUsers([]);
  }

  async function handleCreateRealUser(nameOverride?: string) {
    setRealUserError("");
    const nameToUse = nameOverride ?? newRealUserName;
    if (!nameToUse.trim()) {
      setRealUserError("Name is required");
      return;
    }

    setIsLoading(true);
    setIsCreatingRealUser(true);
    try {
      const response = await fetch("/api/admin/real-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameToUse.trim() }),
      });

      if (response.ok) {
        setNewRealUserName("");
        fetchRealUsers();
      } else {
        const data = await response.json();
        setRealUserError(data.error || "Failed to create real user");
      }
    } catch {
      setRealUserError("Failed to create real user");
    } finally {
      setIsLoading(false);
      setIsCreatingRealUser(false);
    }
  }

  async function handleCreateTestUser(nameOverride?: string) {
    setTestUserError("");
    const nameToUse = nameOverride ?? newTestUserName;
    if (!nameToUse.trim()) {
      setTestUserError("Name is required");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/test-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameToUse.trim() }),
      });

      if (response.ok) {
        setNewTestUserName("");
        fetchTestUsers();
      } else {
        const data = await response.json();
        setTestUserError(data.error || "Failed to create test user");
      }
    } catch {
      setTestUserError("Failed to create test user");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteTestUser(userId: string) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/test-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (response.ok) {
        setTestUsers((previous) => previous.filter((user) => user.id !== userId));
      } else {
        const data = await response.json();
        setTestUserError(data.error || "Failed to delete");
      }
    } catch {
      setTestUserError("Failed to delete test user");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeleteRealUser(userId: string) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/real-users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (response.ok) {
        setRealUsers((previous) => previous.filter((user) => user.id !== userId));
      } else {
        const data = await response.json();
        setTestUserError(data.error || "Failed to delete");
      }
    } catch {
      setTestUserError("Failed to delete real user");
    } finally {
      setIsLoading(false);
    }
  }

  /** Log in as any user via the admin-login endpoint */
  async function handleAdminLogin(userId: string) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        router.push("/");
        router.refresh();
      }
    } catch {
      setTestUserError("Failed to log in as user");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRunJob(job: CronJobConfig) {
    setRunningJobs((previous) => new Set(previous).add(job.id));
    try {
      const response = await fetch(job.endpoint, { method: "POST" });
      const data = await response.json();
      setJobResults((previous) => ({
        ...previous,
        [job.id]: {
          success: response.ok,
          message: response.ok ? (data.message || "Completed successfully") : (data.error || "Failed"),
        },
      }));
    } catch {
      setJobResults((previous) => ({
        ...previous,
        [job.id]: { success: false, message: "Network error" },
      }));
    } finally {
      setRunningJobs((previous) => {
        const next = new Set(previous);
        next.delete(job.id);
        return next;
      });
    }
  }

  /* ─── Not yet activated: show password form ─── */
  if (!adminMode) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Admin Login
            </h1>
            <p className="mt-2 text-sm text-muted">
              Enter the admin password to continue.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 space-y-3">
            <label className="text-xs font-medium text-muted">
              Admin Password
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" && handleActivateAdmin()
                }
                placeholder="Enter admin password..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleActivateAdmin}
                disabled={isLoading}
                className="rounded-lg bg-warning/20 px-4 py-2 text-sm font-medium text-warning hover:bg-warning/30 transition-colors disabled:opacity-50"
              >
                Activate
              </button>
            </div>
            {adminError && (
              <p className="text-xs text-danger">{adminError}</p>
            )}
          </div>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              ← Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Admin mode active: full admin panel ─── */
  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          ← Back
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Admin Tools</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-warning animate-pulse" />
              <span className="text-sm font-semibold text-warning">
                Admin Mode Active
              </span>
            </div>
            <button
              onClick={handleDeactivateAdmin}
              className="text-xs text-muted hover:text-foreground transition-colors"
            >
              Deactivate
            </button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted">
          Manage the app, trigger background jobs, and debug.
        </p>
      </div>

      {/* ── User Management ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">User Management</h2>

        {/* Create users — side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <label className="text-xs font-medium text-muted">
              Create Real User
            </label>
            <p className="text-[10px] text-muted">
              Looks up playactivate.com and imports score, rank, and stats.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRealUserName}
                onChange={(event) => setNewRealUserName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleCreateRealUser()}
                placeholder="Activate player name..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => handleCreateRealUser()}
                disabled={isLoading}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isCreatingRealUser ? "Looking up…" : "Create"}
              </button>
            </div>
            {realUserError && (
              <p className="text-xs text-danger">{realUserError}</p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <label className="text-xs font-medium text-muted">
              Create Test User
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTestUserName}
                onChange={(event) => setNewTestUserName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleCreateTestUser()}
                placeholder="Activate player name..."
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => handleCreateTestUser()}
                disabled={isLoading}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                Create
              </button>
            </div>
            {testUserError && (
              <p className="text-xs text-danger">{testUserError}</p>
            )}
          </div>
        </div>

        {/* Two-column user list: Real Users | Test Users */}
        <div className="grid grid-cols-2 gap-4">
          {/* Real Users column */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted">
              Real Users ({realUsers.length})
            </label>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {realUsers.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">No real users yet — create one above</p>
              ) : (
                realUsers.map((realUser) => (
                  <div
                    key={realUser.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-card-hover transition-colors"
                  >
                    <button
                      onClick={() => handleAdminLogin(realUser.id)}
                      disabled={isLoading}
                      className="flex flex-1 items-center justify-between min-w-0 disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-foreground">
                          {realUser.displayName}
                        </span>
                        {realUser.rankColor && (
                          <span className="shrink-0 text-[10px] text-muted">
                            {realUser.rankColor}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {realUser.badgesCompleted > 0 && (
                          <span className="shrink-0 text-[10px] text-muted">
                            {realUser.badgesCompleted}
                          </span>
                        )}
                        {realUser.role === "superuser" && (
                          <span className="shrink-0 rounded bg-accent/20 px-1 py-0.5 text-[9px] font-bold text-accent">
                            SU
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteUser({ id: realUser.id, name: realUser.displayName, isTest: false });
                      }}
                      disabled={isLoading}
                      className="shrink-0 rounded p-1.5 text-danger/60 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                      title="Delete real user"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Test Users column */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted">
              Test Users ({testUsers.length})
            </label>
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {testUsers.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted">No test users yet — create one above</p>
              ) : (
                testUsers.map((testUser) => (
                  <div
                    key={testUser.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-card-hover transition-colors"
                  >
                    <button
                      onClick={() => handleAdminLogin(testUser.id)}
                      disabled={isLoading}
                      className="flex flex-1 items-center justify-between min-w-0 disabled:opacity-50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-foreground">
                          {testUser.activatePlayerName || testUser.realName}
                        </span>
                        {testUser.rankColor && (
                          <span className="shrink-0 text-[10px] text-muted">
                            {testUser.rankColor}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {testUser.badgesCompleted > 0 && (
                          <span className="shrink-0 text-[10px] text-muted">
                            {testUser.badgesCompleted}
                          </span>
                        )}
                        <span className="shrink-0 rounded bg-warning/20 px-1 py-0.5 text-[9px] font-bold text-warning">
                          TEST
                        </span>
                      </div>
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteUser({ id: testUser.id, name: testUser.activatePlayerName || testUser.realName || "Unknown", isTest: true });
                      }}
                      disabled={isLoading}
                      className="shrink-0 rounded p-1.5 text-danger/60 hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                      title="Delete test user"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cron Jobs ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Cron Jobs (Ad Hoc)</h2>
        <p className="text-xs text-muted">
          Manually trigger background jobs that would normally run on a schedule.
        </p>

        <div className="space-y-3">
          {CRON_JOBS.map((job) => {
            const isRunning = runningJobs.has(job.id);
            const result = jobResults[job.id];
            const isPlaceholder = !job.endpoint;

            return (
              <div
                key={job.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground">{job.label}</h3>
                      {isPlaceholder && (
                        <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                          PLACEHOLDER
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">{job.description}</p>
                  </div>
                  <button
                    onClick={() => handleRunJob(job)}
                    disabled={isRunning}
                    className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    {isRunning ? "Running..." : "Run Now"}
                  </button>
                </div>
                {result && (
                  <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                    result.success ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  }`}>
                    {result.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quick Links ── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Quick Links</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/login"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
          >
            Switch User (Login)
          </Link>
          <Link
            href="/sessions"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
          >
            Sessions
          </Link>
          <Link
            href="/players"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
          >
            Players
          </Link>
        </div>
      </div>

      {/* Delete user confirmation */}
      {pendingDeleteUser && (
        <ConfirmDialog
          title={`Delete "${pendingDeleteUser.name}"?`}
          description={
            pendingDeleteUser.isTest
              ? "This will permanently remove this test user and all their data. This cannot be undone."
              : "This will permanently remove this user, their sessions, badge data, and comments. They can re-create their account via Google OAuth. This cannot be undone."
          }
          actions={[
            {
              label: "Delete",
              variant: "danger",
              onClick: () => {
                if (pendingDeleteUser.isTest) {
                  handleDeleteTestUser(pendingDeleteUser.id);
                } else {
                  handleDeleteRealUser(pendingDeleteUser.id);
                }
                setPendingDeleteUser(null);
              },
            },
            {
              label: "Cancel",
              variant: "muted",
              onClick: () => setPendingDeleteUser(null),
            },
          ]}
          onClose={() => setPendingDeleteUser(null)}
        />
      )}
    </div>
  );
}
