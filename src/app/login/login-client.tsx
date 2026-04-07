"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface TestUser {
  id: string;
  activatePlayerName: string | null;
  realName: string | null;
  role: string;
  createdAt: string;
}

export function LoginClient({ initialAdminMode }: { initialAdminMode: boolean }) {
  const [adminMode, setAdminMode] = useState(initialAdminMode);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [showAdminEntry, setShowAdminEntry] = useState(false);
  const [testUsers, setTestUsers] = useState<TestUser[]>([]);
  const [newTestUserName, setNewTestUserName] = useState("");
  const [testUserError, setTestUserError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (adminMode) {
      fetchTestUsers();
    }
  }, [adminMode]);

  async function fetchTestUsers() {
    const response = await fetch("/api/admin/test-users");
    if (response.ok) {
      const data = await response.json();
      setTestUsers(data.testUsers);
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
  }

  async function handleCreateTestUser() {
    setTestUserError("");
    if (!newTestUserName.trim()) {
      setTestUserError("Name is required");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/test-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: newTestUserName.trim() }),
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

  async function handleTestLogin(userId: string) {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        router.push("/badges");
        router.refresh();
      }
    } catch {
      setTestUserError("Failed to log in as test user");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Badge Hunters
          </h1>
          <p className="mt-2 text-sm text-muted">
            Plan your Activate badge runs with the crew
          </p>
        </div>

        {/* Google OAuth */}
        <div className="rounded-xl border border-border bg-card p-6">
          <button
            onClick={() => signIn("google", { callbackUrl: "/badges" })}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
        </div>

        {/* Admin mode section */}
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
                    placeholder="Display name..."
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={handleCreateTestUser}
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

              {/* Test user list */}
              {testUsers.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted">
                    Log in as Test User
                  </label>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {testUsers.map((testUser) => (
                      <button
                        key={testUser.id}
                        onClick={() => handleTestLogin(testUser.id)}
                        disabled={isLoading}
                        className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm hover:bg-card-hover transition-colors disabled:opacity-50"
                      >
                        <span className="text-foreground">
                          {testUser.activatePlayerName || testUser.realName}
                        </span>
                        <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                          TEST
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {showAdminEntry ? (
                <>
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
                </>
              ) : (
                <button
                  onClick={() => setShowAdminEntry(true)}
                  className="w-full text-center text-xs text-muted hover:text-foreground transition-colors"
                >
                  Enter Admin Mode
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
