export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Back button */}
      <div className="h-4 w-20 rounded bg-border animate-pulse" />

      {/* Title */}
      <div className="mt-4 h-8 w-28 rounded-lg bg-border animate-pulse" />

      {/* Display name section */}
      <div className="mt-6 rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="h-5 w-32 rounded bg-border animate-pulse" />

        <div className="space-y-3">
          <div>
            <div className="h-4 w-24 rounded bg-border animate-pulse" />
            <div className="mt-1 h-10 w-full rounded-lg bg-border animate-pulse" />
          </div>
          <div>
            <div className="h-4 w-28 rounded bg-border animate-pulse" />
            <div className="mt-1 h-10 w-full rounded-lg bg-border animate-pulse" />
          </div>
        </div>

        <div className="h-10 w-24 rounded-lg bg-border animate-pulse" />
      </div>

      {/* Danger zone */}
      <div className="mt-6 rounded-xl border border-danger/30 bg-card p-5 space-y-3">
        <div className="h-5 w-28 rounded bg-border animate-pulse" />
        <div className="h-4 w-64 rounded bg-border animate-pulse" />
        <div className="h-10 w-32 rounded-lg bg-border animate-pulse" />
      </div>
    </div>
  );
}
