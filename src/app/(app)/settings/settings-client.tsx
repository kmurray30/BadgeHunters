"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface Props {
  displayNameMode: string;
  realName: string | null;
  activatePlayerName: string | null;
}

export function SettingsClient({ displayNameMode, realName: _realName, activatePlayerName: _activatePlayerName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [currentMode, setCurrentMode] = useState(displayNameMode);

  async function handleToggle(mode: string) {
    if (mode === currentMode) return;

    setCurrentMode(mode);
    await fetch("/api/profile/display-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Show Names As</h2>
            <p className="text-xs text-muted">
              How you see everyone (including yourself) across the site.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            <button
              onClick={() => handleToggle("player_name")}
              disabled={isPending}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                currentMode === "player_name"
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Usernames
            </button>
            <button
              onClick={() => handleToggle("real_name")}
              disabled={isPending}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                currentMode === "real_name"
                  ? "bg-accent text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Real Names
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
