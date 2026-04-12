"use client";

import { useState } from "react";
import Link from "next/link";

interface CronJobConfig {
  id: string;
  label: string;
  description: string;
  endpoint: string | null;
}

const CRON_JOBS: CronJobConfig[] = [
  {
    id: "score-sync",
    label: "Sync PlayActivate Scores",
    description: "Scrape playactivate.com and update all users' scores and rank colors. Currently a placeholder — will be implemented with the cron infrastructure.",
    endpoint: null,
  },
  {
    id: "session-expiry",
    label: "Trigger Session Expiry",
    description: "Check for expired sessions and transition them to review/closed state. Currently a placeholder — will be implemented with the cron infrastructure.",
    endpoint: null,
  },
];

export function AdminClient() {
  const [runningJobs, setRunningJobs] = useState<Set<string>>(new Set());
  const [jobResults, setJobResults] = useState<Record<string, { success: boolean; message: string }>>({});

  async function handleRunJob(job: CronJobConfig) {
    if (!job.endpoint) {
      setJobResults((previous) => ({
        ...previous,
        [job.id]: { success: false, message: "Not implemented yet — this is a placeholder for future cron job infrastructure." },
      }));
      return;
    }

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

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          ← Back
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Admin Tools</h1>
        <p className="mt-1 text-sm text-muted">
          Manage the app, trigger background jobs, and debug.
        </p>
      </div>

      {/* Cron Jobs */}
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

      {/* Quick Links */}
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
    </div>
  );
}
