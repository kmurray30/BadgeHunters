"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SITE_NAME } from "@/lib/config";
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

function GoogleLogo() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function LoginClient({ initialAdminMode }: { initialAdminMode: boolean }) {
  const [adminMode, setAdminMode] = useState(initialAdminMode);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [showAdminEntry, setShowAdminEntry] = useState(false);
  const [testUsers, setTestUsers] = useState<TestUser[]>([]);
  const [realUsers, setRealUsers] = useState<RealUser[]>([]);
  const [newTestUserName, setNewTestUserName] = useState("");
  const [testUserError, setTestUserError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activateSearchResults, setActivateSearchResults] = useState<string[]>([]);
  const [activateSearchDebug, setActivateSearchDebug] = useState<string[]>([]);
  const [isSearchingActivate, setIsSearchingActivate] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ found: boolean; searchTerm: string | null; activateUsername: string | null; score: number | null; rankColor?: string | null; error: string | null } | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<{ id: string; name: string; isTest: boolean } | null>(null);
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
        setShowAdminEntry(false);
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

  async function searchActivate(query: string) {
    if (query.trim().length < 2) {
      setActivateSearchResults([]);
      setActivateSearchDebug([]);
      return;
    }
    setIsSearchingActivate(true);
    setActivateSearchDebug([]);
    try {
      const response = await fetch(`/api/admin/search-activate?q=${encodeURIComponent(query.trim())}`);
      if (response.ok) {
        const data = await response.json();
        console.log("[search-activate] Full response:", data);
        setActivateSearchResults(data.results || []);
        setActivateSearchDebug(data.debug || []);
      }
    } catch (error) {
      console.error("[search-activate] Client error:", error);
      setActivateSearchResults([]);
      setActivateSearchDebug(["Client-side fetch error"]);
    } finally {
      setIsSearchingActivate(false);
    }
  }

  async function handleCreateTestUser(nameOverride?: string, syncScoreAfterCreate = false) {
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
        const createdData = await response.json();
        setNewTestUserName("");
        setActivateSearchResults([]);
        setSyncResult(null);

        // If we have a sync result with a score, apply it to the newly created user
        if (syncScoreAfterCreate && createdData.user?.id) {
          await fetch(`/api/admin/activate-lookup?name=${encodeURIComponent(nameToUse.trim())}&userId=${createdData.user.id}`);
        }

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

  /** Look up a player name on playactivate.com to verify it exists and get their score */
  async function handleSyncLookup() {
    const nameToLookup = newTestUserName.trim();
    if (!nameToLookup) return;

    setIsSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch(`/api/admin/activate-lookup?name=${encodeURIComponent(nameToLookup)}`);
      if (response.ok) {
        const data = await response.json();
        setSyncResult(data);
      } else {
        setSyncResult({ found: false, searchTerm: nameToLookup, activateUsername: null, score: null, error: "Lookup request failed" });
      }
    } catch {
      setSyncResult({ found: false, searchTerm: nameToLookup, activateUsername: null, score: null, error: "Network error" });
    } finally {
      setIsSyncing(false);
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

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className={`w-full ${adminMode ? "max-w-4xl" : "max-w-md"} space-y-8`}>
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {SITE_NAME}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Plan your Activate badge runs with the crew
          </p>
        </div>

        {/* Google OAuth — Sign In / Sign Up */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <button
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <GoogleLogo />
            Sign in with Google
          </button>
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <span className="relative bg-card px-3 text-xs text-muted">or</span>
          </div>
          <button
            onClick={() => signIn("google", { callbackUrl: "/onboarding" })}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-card-hover transition-colors"
          >
            <GoogleLogo />
            Create an account
          </button>
        </div>

        {/* Admin mode section */}
        {(adminMode || showAdminEntry) && (
        <div className="rounded-xl border border-border bg-card p-6">
          {adminMode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
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

              {/* Create test user */}
              <div className="space-y-2">
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
                    onClick={handleSyncLookup}
                    disabled={isLoading || isSyncing || newTestUserName.trim().length < 1}
                    className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium text-success hover:bg-success/20 transition-colors disabled:opacity-50"
                    title="Look up this name on playactivate.com"
                  >
                    {isSyncing ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="whitespace-nowrap text-xs">Searching...</span>
                      </>
                    ) : "Sync"}
                  </button>
                  <button
                    onClick={() => handleCreateTestUser()}
                    disabled={isLoading}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
                  >
                    Create
                  </button>
                </div>
                {/* Activate sync in-progress message */}
                {isSyncing && (
                  <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-xs text-success">
                    <svg className="h-3.5 w-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Searching for <span className="font-semibold">&quot;{newTestUserName.trim()}&quot;</span> on playactivate.com&hellip;</span>
                  </div>
                )}
                {/* Activate sync lookup result */}
                {!isSyncing && syncResult && (
                  <div className={`rounded-lg px-3 py-2 text-xs ${
                    syncResult.found
                      ? "border border-success/30 bg-success/10 text-success"
                      : syncResult.error
                        ? "border border-warning/30 bg-warning/10 text-warning"
                        : "border border-border bg-card-hover text-muted"
                  }`}>
                    {syncResult.found ? (
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold">{syncResult.activateUsername}</span>
                          {" found — Score: "}
                          <span className="font-bold">{syncResult.score?.toLocaleString()}</span>
                          {syncResult.rankColor && (
                            <span className="ml-1 text-[10px]">({syncResult.rankColor})</span>
                          )}
                        </div>
                        <button
                          onClick={() => handleCreateTestUser(syncResult.activateUsername ?? undefined, true)}
                          disabled={isLoading}
                          className="rounded bg-success/20 px-2 py-0.5 text-[10px] font-bold text-success hover:bg-success/30 transition-colors"
                        >
                          Create with score
                        </button>
                      </div>
                    ) : syncResult.error ? (
                      <span>{syncResult.error}</span>
                    ) : (
                      <span>Player &quot;{syncResult.searchTerm}&quot; not found on Activate</span>
                    )}
                  </div>
                )}
                {/* Activate search results */}
                {activateSearchResults.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted">Found on Activate — click to create:</p>
                    {activateSearchResults.map((resultName) => (
                      <button
                        key={resultName}
                        onClick={() => handleCreateTestUser(resultName)}
                        disabled={isLoading}
                        className="flex w-full items-center justify-between rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 transition-colors disabled:opacity-50"
                      >
                        <span>{resultName}</span>
                        <span className="text-[10px]">+ Create</span>
                      </button>
                    ))}
                  </div>
                )}
                {/* Debug log from Activate search */}
                {activateSearchDebug.length > 0 && (
                  <details className="text-[10px] text-muted">
                    <summary className="cursor-pointer hover:text-foreground">Search debug log ({activateSearchDebug.length} lines)</summary>
                    <pre className="mt-1 max-h-32 overflow-y-auto rounded bg-background p-2 text-[9px] leading-relaxed">
                      {activateSearchDebug.join("\n")}
                    </pre>
                  </details>
                )}
                {testUserError && (
                  <p className="text-xs text-danger">{testUserError}</p>
                )}
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
                      <p className="py-4 text-center text-xs text-muted">No real users yet</p>
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
          ) : showAdminEntry ? (
            <div className="space-y-3">
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
              <button
                onClick={() => {
                  setShowAdminEntry(false);
                  setAdminPassword("");
                  setAdminError("");
                }}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
        )}

        {/* Collapsed admin entry — tiny, outside the card */}
        {!adminMode && !showAdminEntry && (
          <div className="mt-2 text-center">
            <button
              onClick={() => setShowAdminEntry(true)}
              className="text-[10px] text-muted/30 hover:text-muted/60 transition-colors"
            >
              admin
            </button>
          </div>
        )}
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
