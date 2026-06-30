"use client";

import { useState } from "react";
import { SITE_NAME } from "@/lib/config";

interface Props {
  googleName: string | null;
}

type Step = "activate_name" | "enter_name";

export function OnboardingClient({ googleName }: Props) {
  const [step, setStep] = useState<Step>("activate_name");
  const [activateName, setActivateName] = useState("");
  const [realName, setRealName] = useState(googleName ?? "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  async function handleCancel() {
    setIsCancelling(true);
    try {
      await fetch("/api/auth/signout", { method: "POST", redirect: "manual" });
    } catch {
      // Ignore — still navigate away.
    }
    window.location.href = "/login";
  }

  function handleActivateNext() {
    setError("");
    setIsSkipping(false);
    setStep("enter_name");
  }

  function handleSkip() {
    setError("");
    setIsSkipping(true);
    setActivateName("");
    setStep("enter_name");
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
          activatePlayerName: isSkipping ? null : (activateName.trim() || null),
        }),
      });

      if (response.ok) {
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
      {/* Back to sign in */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={handleCancel}
          disabled={isCancelling}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          {isCancelling ? "Signing out…" : "Back to sign in"}
        </button>
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Welcome to {SITE_NAME}!</h1>
        <p className="mt-2 text-sm text-muted">
          Let&apos;s get you set up.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {/* Step 1: Activate username */}
        {step === "activate_name" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Activate Player Name</label>
              <p className="mt-0.5 text-xs text-muted">
                Enter your player name from{" "}
                <a
                  href="https://www.playactivate.com/scores"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover underline"
                >
                  playactivate.com/scores
                </a>
                .
              </p>
              <input
                type="text"
                value={activateName}
                onChange={(event) => {
                  setActivateName(event.target.value);
                  setError("");
                }}
                onKeyDown={(event) => event.key === "Enter" && activateName.trim() && handleActivateNext()}
                placeholder="Player name..."
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                autoFocus
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              onClick={handleActivateNext}
              disabled={!activateName.trim()}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              Next
            </button>
            <button
              onClick={handleSkip}
              className="w-full text-xs text-muted hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* Step 2: Real name + finish */}
        {step === "enter_name" && (
          <div className="space-y-4">
            {!isSkipping && activateName.trim() && (
              <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-center text-xs text-success">
                Activate account: <span className="font-bold">{activateName.trim()}</span>
              </div>
            )}
            {isSkipping && (
              <div className="rounded-lg border border-border bg-background/50 px-3 py-2 text-center text-xs text-muted">
                Activate account not linked — you can link it later from your profile.
              </div>
            )}
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
                  setStep("activate_name");
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
                {isSubmitting ? "Looking up player…" : "Complete Setup"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
