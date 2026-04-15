"use client";

import { useState, useEffect, useCallback } from "react";
import { SITE_NAME } from "@/lib/config";

interface Props {
  email: string | null;
  googleName: string | null;
}

interface LookupResult {
  found: boolean;
  searchTerm: string | null;
  activateUsername: string | null;
  score: number | null;
  rank: number | null;
  leaderboardPosition: string | null;
  levelsBeat: string | null;
  coins: number | null;
  error: string | null;
}

type Step = "searching_email" | "email_result" | "email_not_found" | "manual_search" | "searching_manual" | "confirm_account" | "enter_name";

export function OnboardingClient({ email, googleName }: Props) {
  const [step, setStep] = useState<Step>("searching_email");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [manualName, setManualName] = useState("");
  const [realName, setRealName] = useState(googleName ?? "");
  const [confirmedActivateName, setConfirmedActivateName] = useState("");
  const [confirmedStats, setConfirmedStats] = useState<{
    score: number | null;
    rank: number | null;
    leaderboardPosition: string | null;
    levelsBeat: string | null;
    coins: number | null;
  }>({ score: null, rank: null, leaderboardPosition: null, levelsBeat: null, coins: null });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const performLookup = useCallback(async (searchTerm: string): Promise<LookupResult | null> => {
    try {
      const response = await fetch(`/api/onboarding/activate-lookup?name=${encodeURIComponent(searchTerm)}`);
      if (response.ok) {
        return await response.json();
      }
      return { found: false, searchTerm, activateUsername: null, score: null, rank: null, leaderboardPosition: null, levelsBeat: null, coins: null, error: "Lookup request failed" };
    } catch {
      return { found: false, searchTerm, activateUsername: null, score: null, rank: null, leaderboardPosition: null, levelsBeat: null, coins: null, error: "Network error" };
    }
  }, []);

  // Auto-search by email on mount
  useEffect(() => {
    if (!email) {
      setStep("manual_search");
      return;
    }

    let cancelled = false;
    async function searchByEmail() {
      const result = await performLookup(email!);
      if (cancelled) return;
      setLookupResult(result);

      if (result?.found) {
        setStep("email_result");
      } else {
        setStep("email_not_found");
      }
    }

    searchByEmail();
    return () => { cancelled = true; };
  }, [email, performLookup]);

  async function handleManualSearch() {
    const trimmed = manualName.trim();
    if (!trimmed) return;

    setStep("searching_manual");
    setLookupResult(null);
    setError("");

    const result = await performLookup(trimmed);
    setLookupResult(result);

    if (result?.found) {
      setStep("confirm_account");
    } else {
      setStep("manual_search");
      if (result?.error) {
        setError(result.error);
      } else {
        setError(`No Activate account found for "${trimmed}"`);
      }
    }
  }

  function handleConfirmAccount(activateName: string, result: LookupResult) {
    setConfirmedActivateName(activateName);
    setConfirmedStats({
      score: result.score,
      rank: result.rank,
      leaderboardPosition: result.leaderboardPosition,
      levelsBeat: result.levelsBeat,
      coins: result.coins,
    });
    setStep("enter_name");
  }

  function handleRejectAccount() {
    setLookupResult(null);
    setManualName("");
    setError("");
    setStep("manual_search");
  }

  async function handleCompleteOnboarding() {
    if (!realName.trim()) {
      setError("Please enter your name");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          realName: realName.trim(),
          activatePlayerName: confirmedActivateName,
          score: confirmedStats.score,
          activateRank: confirmedStats.rank,
          leaderboardPosition: confirmedStats.leaderboardPosition,
          levelsBeat: confirmedStats.levelsBeat,
          coins: confirmedStats.coins,
        }),
      });

      if (response.ok) {
        // Hard reload so the server re-evaluates the JWT (jwt callback detects
        // the newly-created User, upgrades the token, and clears pendingOnboarding)
        window.location.href = "/";
      } else {
        const data = await response.json();
        setError(data.error || "Failed to complete setup");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Welcome to {SITE_NAME}!</h1>
        <p className="mt-2 text-sm text-muted">
          Let&apos;s link your Activate account.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {/* Step 1a: Auto-searching by email */}
        {step === "searching_email" && (
          <div className="space-y-4 text-center">
            <SearchingSpinner />
            <div>
              <p className="text-sm text-foreground">Searching Activate by email...</p>
              <p className="mt-1 text-xs text-muted">{email}</p>
            </div>
          </div>
        )}

        {/* Step 1b: Email search found a match */}
        {step === "email_result" && lookupResult?.found && (
          <div className="space-y-4">
            {/* Success header */}
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-widest text-success/80">Account found</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{lookupResult.activateUsername}</p>
              <p className="mt-0.5 text-xs text-muted">via your email</p>
            </div>

            {/* Stat cards */}
            <AccountStats result={lookupResult} />

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleConfirmAccount(lookupResult.activateUsername!, lookupResult)}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
              >
                Yes, this is me
              </button>
              <button
                onClick={handleRejectAccount}
                className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              >
                That&apos;s not me — search by username or other email
              </button>
            </div>
          </div>
        )}

        {/* Step 1c: Email search didn't find anything */}
        {step === "email_not_found" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-center">
              <svg className="mx-auto h-8 w-8 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-foreground">No Activate account found for your email</p>
              <p className="mt-1 text-xs text-muted">{email}</p>
              {lookupResult?.error && (
                <p className="mt-2 text-xs text-warning">{lookupResult.error}</p>
              )}
            </div>
            <button
              onClick={() => {
                setError("");
                setStep("manual_search");
              }}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Search by username instead
            </button>
          </div>
        )}

        {/* Step 2: Manual username/email search */}
        {step === "manual_search" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Activate Player Name or Email
              </label>
              <p className="mt-0.5 text-xs text-muted">
                Enter your player name or account email from playactivate.com
              </p>
              <input
                type="text"
                value={manualName}
                onChange={(event) => {
                  setManualName(event.target.value);
                  setError("");
                }}
                onKeyDown={(event) => event.key === "Enter" && handleManualSearch()}
                placeholder="Player name or email..."
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              onClick={handleManualSearch}
              disabled={!manualName.trim()}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              Search
            </button>
          </div>
        )}

        {/* Step 2b: Searching by manual name or email */}
        {step === "searching_manual" && (
          <div className="space-y-4 text-center">
            <SearchingSpinner />
            <div>
              <p className="text-sm text-foreground">
                {manualName.trim().includes("@")
                  ? "Searching Activate by email..."
                  : "Searching Activate by username..."}
              </p>
              <p className="mt-1 text-xs text-muted">&quot;{manualName.trim()}&quot;</p>
            </div>
          </div>
        )}

        {/* Step 3: Confirm the found account */}
        {step === "confirm_account" && lookupResult?.found && (
          <div className="space-y-4">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
                <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="mt-3 text-xs font-medium uppercase tracking-widest text-success/80">Account found</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{lookupResult.activateUsername}</p>
              <p className="mt-0.5 text-xs text-muted">via username search</p>
            </div>

            <AccountStats result={lookupResult} />

            <div className="space-y-2 pt-1">
              <button
                onClick={() => handleConfirmAccount(lookupResult.activateUsername!, lookupResult)}
                className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
              >
                Use this account
              </button>
              <button
                onClick={handleRejectAccount}
                className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              >
                Search a different name
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Enter real name and finish */}
        {step === "enter_name" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-center text-xs text-success">
              <p>Linked to <span className="font-bold">{confirmedActivateName}</span></p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-muted">
                {confirmedStats.score !== null && (
                  <span>Score: <span className="font-semibold text-foreground">{confirmedStats.score.toLocaleString()}</span></span>
                )}
                {confirmedStats.rank !== null && (
                  <span>Rank: <span className="font-semibold text-foreground">{confirmedStats.rank}</span></span>
                )}
                {confirmedStats.leaderboardPosition && (
                  <span>Leaderboard: <span className="font-semibold text-foreground">{confirmedStats.leaderboardPosition}</span></span>
                )}
                {confirmedStats.levelsBeat && (
                  <span>Levels: <span className="font-semibold text-foreground">{confirmedStats.levelsBeat}</span></span>
                )}
                {confirmedStats.coins !== null && (
                  <span>Coins: <span className="font-semibold text-foreground">{confirmedStats.coins}</span></span>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Your Name</label>
              <p className="mt-0.5 text-xs text-muted">
                Your real name so your friends know who you are
              </p>
              <input
                type="text"
                value={realName}
                onChange={(event) => {
                  setRealName(event.target.value);
                  setError("");
                }}
                onKeyDown={(event) => event.key === "Enter" && handleCompleteOnboarding()}
                placeholder="Enter your real name..."
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep("manual_search");
                  setError("");
                }}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCompleteOnboarding}
                disabled={isSubmitting || !realName.trim()}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Setting up..." : "Complete Setup"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Spinner shown during Activate searches */
function SearchingSpinner() {
  return (
    <div className="flex justify-center">
      <svg className="h-8 w-8 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
    </div>
  );
}

/** All Activate stats shown when an account is found */
function AccountStats({ result }: { result: LookupResult }) {
  const stats = [
    result.score !== null && { label: "Score", value: result.score.toLocaleString() },
    result.rank !== null && { label: "Rank", value: String(result.rank) },
    result.leaderboardPosition && { label: "Leaderboard", value: result.leaderboardPosition },
    result.levelsBeat && { label: "Levels", value: result.levelsBeat },
    result.coins !== null && { label: "Coins", value: result.coins!.toLocaleString() },
  ].filter(Boolean) as { label: string; value: string }[];

  if (stats.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3 flex flex-wrap justify-center gap-x-5 gap-y-1">
      {stats.map(({ label, value }) => (
        <span key={label} className="text-xs text-muted">
          {label}: <span className="font-semibold text-foreground">{value}</span>
        </span>
      ))}
    </div>
  );
}
