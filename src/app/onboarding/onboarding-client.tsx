"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  userId: string;
  email: string | null;
  googleName: string | null;
}

export function OnboardingClient({ userId, email, googleName }: Props) {
  const [step, setStep] = useState<"name" | "player_name">("name");
  const [realName, setRealName] = useState(googleName ?? "");
  const [activatePlayerName, setActivatePlayerName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleSubmitName() {
    if (!realName.trim()) {
      setError("Please enter your name");
      return;
    }
    setStep("player_name");
    setError("");
  }

  async function handleSubmitPlayerName() {
    if (!activatePlayerName.trim()) {
      setError("Please enter your Activate player name");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          realName: realName.trim(),
          activatePlayerName: activatePlayerName.trim(),
        }),
      });

      if (response.ok) {
        router.push("/badges");
        router.refresh();
      } else {
        const data = await response.json();
        setError(data.error || "Failed to complete onboarding");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-foreground">Welcome to Badge Hunters!</h1>
        <p className="mt-2 text-sm text-muted">
          Let&apos;s get your account set up.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {step === "name" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Your Name</label>
              <input
                type="text"
                value={realName}
                onChange={(event) => setRealName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSubmitName()}
                placeholder="Enter your real name..."
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              onClick={handleSubmitName}
              className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {step === "player_name" && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">
                Activate Player Name
              </label>
              <p className="text-xs text-muted">
                Enter your player name from playactivate.com
              </p>
              <input
                type="text"
                value={activatePlayerName}
                onChange={(event) => setActivatePlayerName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSubmitPlayerName()}
                placeholder="Your Activate player name..."
                className="mt-1 w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep("name");
                  setError("");
                }}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmitPlayerName}
                disabled={isLoading}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {isLoading ? "Setting up..." : "Complete Setup"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
