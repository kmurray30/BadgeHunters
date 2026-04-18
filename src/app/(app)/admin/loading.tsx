export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Title */}
      <div className="h-8 w-40 rounded-lg bg-border animate-pulse" />

      {/* Admin mode toggle */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-6 w-12 rounded-full bg-border animate-pulse" />
        <div className="h-4 w-24 rounded bg-border animate-pulse" />
      </div>

      {/* Cron jobs section */}
      <div className="mt-6 space-y-3">
        <div className="h-5 w-28 rounded bg-border animate-pulse" />
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border bg-card p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="h-5 w-40 rounded bg-border animate-pulse" />
              <div className="h-8 w-16 rounded-lg bg-border animate-pulse" />
            </div>
            <div className="h-3 w-full rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>

      {/* Users section */}
      <div className="mt-6 space-y-3">
        <div className="h-5 w-20 rounded bg-border animate-pulse" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-border animate-pulse" />
              <div className="h-4 w-32 rounded bg-border animate-pulse" />
            </div>
            <div className="h-5 w-16 rounded bg-border animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
